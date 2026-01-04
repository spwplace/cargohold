import type { GameState, GameAction, CardDef, Scenelet, PortId, ChronicleEntry, AchievementId } from './types.js';
import { dispatch } from './actions.js';
import { 
  calculateJourneyEventCount, 
  calculateFuelCost,
  processJourneyWear, 
  processCargoDecay, 
  tickContractTimers,
  advanceCycle,
  incrementJumps,
} from './simulate.js';
import { selectEvent, applyEffects, createSeededRng, meetsChoiceRequirements, recordSceneletTriggered, type TriggeredEvent, type EventContextType } from './events.js';
import { createInitialState } from './init.js';
import { DEFAULT_CONFIG, createId } from './types.js';
import { checkAchievements, getAchievement } from '../content/achievements/index.js';
import {
  type MetaState,
  type SaveData,
  saveGameState,
  loadGameState,
  clearGameState,
  saveMetaState,
  loadMetaState,
  updateMetaAchievements,
  incrementMetaGamesStarted,
  downloadSaveFile,
  createFileInput,
  clearAllData,
} from './persistence.js';

export interface JourneyState {
  destination: PortId;
  eventsRemaining: number;
  totalEvents: number;
}

export interface GameController {
  getState(): GameState;
  getMetaState(): MetaState;
  dispatch(action: GameAction): { success: boolean; message?: string | undefined };
  travel(destination: PortId): { success: boolean; message?: string };
  save(): void;
  load(): boolean;
  reset(): void;
  exportSave(): void;
  importSave(onSuccess: () => void, onError: (msg: string) => void): void;
  clearAll(): void;
  subscribe(listener: StateListener): () => void;
  triggerPortEvent(): TriggeredEvent | null;
  resolveEventChoice(choiceIndex: number): void;
  getCurrentEvent(): TriggeredEvent | null;
  getJourneyState(): JourneyState | null;
  isGameOver(): boolean;
  getNewAchievements(): AchievementId[];
  clearNewAchievements(): void;
}

export type StateListener = (state: GameState) => void;

export function createGameController(
  cardDefs: Map<string, CardDef>,
  scenelets: Scenelet[]
): GameController {
  let state = createInitialState();
  let metaState = loadMetaState();
  let currentEvent: TriggeredEvent | null = null;
  let journeyState: JourneyState | null = null;
  let pendingAchievements: AchievementId[] = [];
  const listeners = new Set<StateListener>();

  function processAchievements() {
    const newlyUnlocked = checkAchievements(state);
    if (newlyUnlocked.length > 0) {
      pendingAchievements.push(...newlyUnlocked);
      
      const unlockedAt = { ...state.achievements.unlockedAt };
      for (const id of newlyUnlocked) {
        unlockedAt[id] = state.time.cycle;
      }
      
      state = {
        ...state,
        achievements: {
          unlocked: [...state.achievements.unlocked, ...newlyUnlocked],
          unlockedAt,
        },
      };
      
      metaState = updateMetaAchievements(metaState, newlyUnlocked, state.time.cycle);
      saveMetaState(metaState);
      
      for (const id of newlyUnlocked) {
        const achievement = getAchievement(id);
        if (achievement) {
          const chronicle: ChronicleEntry = {
            id: createId.chronicleEntry(`achievement-${id}-${state.time.cycle}`),
            type: 'milestone',
            timestamp: { cycle: state.time.cycle },
            title: `Achievement: ${achievement.name}`,
            text: achievement.description,
            tags: ['achievement'],
          };
          state = {
            ...state,
            chronicle: [...state.chronicle, chronicle],
          };
        }
      }
    }
  }

  function notify() {
    for (const listener of listeners) {
      listener(state);
    }
  }

  function save() {
    saveGameState(state);
  }

  function load(): boolean {
    const loaded = loadGameState();
    if (!loaded) return false;
    
    state = loaded;
    notify();
    return true;
  }

  function reset() {
    clearGameState();
    metaState = incrementMetaGamesStarted(metaState);
    saveMetaState(metaState);
    state = createInitialState();
    currentEvent = null;
    journeyState = null;
    notify();
  }

  function exportSave() {
    downloadSaveFile(state, metaState);
  }

  function importSave(onSuccess: () => void, onError: (msg: string) => void) {
    createFileInput(
      (data: SaveData) => {
        state = data.gameState;
        metaState = data.metaState;
        saveGameState(state);
        saveMetaState(metaState);
        currentEvent = null;
        journeyState = null;
        notify();
        onSuccess();
      },
      onError
    );
  }

  function clearAll() {
    clearAllData();
    metaState = loadMetaState();
    state = createInitialState();
    currentEvent = null;
    journeyState = null;
    notify();
  }

  function dispatchAction(action: GameAction) {
    const result = dispatch(state, action, cardDefs, DEFAULT_CONFIG);
    
    if (result.success) {
      state = result.state;
      processAchievements();
      save();
      notify();
    }
    
    return { success: result.success, message: result.message };
  }

  function travel(destination: PortId): { success: boolean; message?: string } {
    if (journeyState) {
      return { success: false, message: 'Already traveling' };
    }

    if (state.world.currentLocation === destination) {
      return { success: false, message: 'Already at this location' };
    }

    const fuelCost = calculateFuelCost(state, cardDefs, DEFAULT_CONFIG);
    if (state.resources.fuel < fuelCost) {
      return { success: false, message: 'Insufficient fuel' };
    }

    state = {
      ...state,
      resources: {
        ...state.resources,
        fuel: state.resources.fuel - fuelCost,
      },
    };

    const eventCount = calculateJourneyEventCount(state, destination, DEFAULT_CONFIG);
    
    journeyState = {
      destination,
      eventsRemaining: eventCount,
      totalEvents: eventCount,
    };

    const port = state.world.ports[destination];
    const chronicle: ChronicleEntry = {
      id: createId.chronicleEntry(`departure-${destination}-${state.time.cycle}`),
      type: 'departure',
      timestamp: { cycle: state.time.cycle },
      title: `Departed for ${port?.name ?? 'Unknown'}`,
      text: `The hold is sealed. The jump drive spools. ${port?.name ?? 'Our destination'} awaits.`,
      tags: ['travel', 'departure'],
      refs: { portId: destination },
    };
    
    state = {
      ...state,
      chronicle: [...state.chronicle, chronicle],
    };

    triggerNextJourneyEvent();
    
    return { success: true, message: `Jumping to ${port?.name ?? 'unknown'}` };
  }

  function triggerNextJourneyEvent() {
    if (!journeyState) return;

    if (journeyState.eventsRemaining <= 0) {
      completeJourney();
      return;
    }

    const rng = createSeededRng(state.rngState);
    state = { ...state, rngState: state.rngState + 1 };

    state = processJourneyWear(state, DEFAULT_CONFIG);
    
    const decayResult = processCargoDecay(state, cardDefs, rng);
    state = decayResult.state;
    
    const contractResult = tickContractTimers(state, cardDefs);
    state = contractResult.state;

    state = advanceCycle(state);

    const context = { state, cardDefs, rng, contextType: 'journey' as EventContextType };
    const journeyScenelets = scenelets.filter(s => 
      !s.requirements.context || s.requirements.context === 'journey' || s.requirements.context === 'any'
    );
    
    const event = selectEvent(journeyScenelets, context);
    
    journeyState = {
      ...journeyState,
      eventsRemaining: journeyState.eventsRemaining - 1,
    };

    if (event) {
      state = recordSceneletTriggered(state, event.scenelet.id);
      currentEvent = event;
    } else {
      currentEvent = createQuietPassageEvent(journeyState.eventsRemaining);
    }

    notify();
  }

  function createQuietPassageEvent(eventsRemaining: number): TriggeredEvent {
    const quietPassages: string[] = [
      'The void stretches on. The engines hum. Nothing stirs.',
      'Stars wheel past the viewport. Another cycle in the dark.',
      'The crew goes about their duties. The hold creaks and settles.',
      'Sensor sweep comes back clean. Just empty space, all the way to the horizon.',
      'A quiet cycle. Sometimes that\'s the best you can hope for.',
    ];
    const idx = state.rngState % quietPassages.length;
    const text: string = quietPassages[idx]!;
    
    return {
      scenelet: {
        id: 'quiet_passage' as any,
        title: 'Quiet Passage',
        tags: ['travel'],
        requirements: {},
        weight: 0,
        cooldown: 0,
        passages: [{
          text,
          choices: eventsRemaining > 0 ? [{
            text: 'Continue the journey',
            effects: {},
          }] : [{
            text: 'Approach destination',
            effects: {},
          }],
        }],
      },
      passageIndex: 0,
    };
  }

  function completeJourney() {
    if (!journeyState) return;

    const destination = journeyState.destination;
    const port = state.world.ports[destination];

    state = incrementJumps(state);

    const chronicle: ChronicleEntry = {
      id: createId.chronicleEntry(`arrival-${destination}-${state.time.cycle}`),
      type: 'arrival',
      timestamp: { cycle: state.time.cycle },
      title: `Arrived at ${port?.name ?? 'Unknown Port'}`,
      text: `The jump ends. ${port?.name ?? 'Our destination'} emerges from the static.`,
      tags: ['travel', 'arrival'],
      refs: { portId: destination },
    };

    const wasFirstVisit = !state.world.ports[destination]?.lastVisited;
    
    state = {
      ...state,
      world: {
        ...state.world,
        currentLocation: destination,
        ports: {
          ...state.world.ports,
          [destination]: port ? {
            ...port,
            lastVisited: { cycle: state.time.cycle },
          } : state.world.ports[destination],
        },
        knownPorts: state.world.knownPorts.includes(destination) 
          ? state.world.knownPorts 
          : [...state.world.knownPorts, destination],
      },
      chronicle: [...state.chronicle, chronicle],
      stats: {
        ...state.stats,
        totalDistanceTraveled: state.stats.totalDistanceTraveled + 1,
        portsVisited: wasFirstVisit ? state.stats.portsVisited + 1 : state.stats.portsVisited,
      },
    };

    journeyState = null;
    processAchievements();
    save();
    notify();
  }

  function triggerPortEvent(): TriggeredEvent | null {
    if (currentEvent) return currentEvent;
    if (journeyState) return null;

    const rng = createSeededRng(state.rngState);
    state = { ...state, rngState: state.rngState + 1 };

    const context = { state, cardDefs, rng, contextType: 'port' as EventContextType };
    const portScenelets = scenelets.filter(s => 
      !s.requirements.context || s.requirements.context === 'port' || s.requirements.context === 'any'
    );
    
    const event = selectEvent(portScenelets, context);
    
    if (event) {
      state = recordSceneletTriggered(state, event.scenelet.id);
      currentEvent = event;
      notify();
    }
    
    return event;
  }

  function resolveEventChoice(choiceIndex: number) {
    if (!currentEvent) return;

    const passage = currentEvent.scenelet.passages[currentEvent.passageIndex];
    
    if (!passage?.choices) {
      currentEvent = null;
      if (journeyState && journeyState.eventsRemaining > 0) {
        triggerNextJourneyEvent();
      } else if (journeyState) {
        completeJourney();
      }
      notify();
      return;
    }

    if (choiceIndex < 0 || choiceIndex >= passage.choices.length) {
      currentEvent = null;
      if (journeyState && journeyState.eventsRemaining > 0) {
        triggerNextJourneyEvent();
      } else if (journeyState) {
        completeJourney();
      }
      notify();
      return;
    }

    const choice = passage.choices[choiceIndex];
    if (!choice) {
      currentEvent = null;
      if (journeyState && journeyState.eventsRemaining > 0) {
        triggerNextJourneyEvent();
      } else if (journeyState) {
        completeJourney();
      }
      notify();
      return;
    }
    
    if (!meetsChoiceRequirements(choice.requirements, state, cardDefs)) {
      return;
    }
    
    state = applyEffects(state, choice.effects, cardDefs);

    if (choice.nextPassage !== undefined) {
      currentEvent = {
        ...currentEvent,
        passageIndex: choice.nextPassage,
      };
    } else {
      currentEvent = null;
      if (journeyState && journeyState.eventsRemaining > 0) {
        triggerNextJourneyEvent();
      } else if (journeyState) {
        completeJourney();
      }
    }

    processAchievements();
    save();
    notify();
  }

  function isGameOver(): boolean {
    return state.resources.hull <= 0 || state.resources.morale <= 0;
  }

  return {
    getState: () => state,
    getMetaState: () => metaState,
    dispatch: dispatchAction,
    travel,
    save,
    load,
    reset,
    exportSave,
    importSave,
    clearAll,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    triggerPortEvent,
    resolveEventChoice,
    getCurrentEvent: () => currentEvent,
    getJourneyState: () => journeyState,
    isGameOver,
    getNewAchievements: () => pendingAchievements,
    clearNewAchievements: () => { pendingAchievements = []; },
  };
}
