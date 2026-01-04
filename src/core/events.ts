import {
  type GameState,
  type Scenelet,
  type SceneletEffects,
  type CardDef,
  type ChronicleEntry,
  type SceneletId,
  createId,
  type CardInstanceId,
} from './types.js';
import { calculateCargoCapacity, countCargoItems } from './simulate.js';

export type EventContextType = 'journey' | 'port';

export interface EventContext {
  state: GameState;
  cardDefs: Map<string, CardDef>;
  rng: () => number;
  contextType: EventContextType;
}

export interface TriggeredEvent {
  scenelet: Scenelet;
  passageIndex: number;
}

export function selectEvent(
  scenelets: Scenelet[],
  context: EventContext
): TriggeredEvent | null {
  const eligible = scenelets.filter(s => meetsRequirements(s, context));
  
  if (eligible.length === 0) return null;
  
  const totalWeight = eligible.reduce((sum, s) => sum + s.weight, 0);
  let roll = context.rng() * totalWeight;
  
  for (const scenelet of eligible) {
    roll -= scenelet.weight;
    if (roll <= 0) {
      return { scenelet, passageIndex: 0 };
    }
  }
  
  return { scenelet: eligible[0]!, passageIndex: 0 };
}

export function recordSceneletTriggered(state: GameState, sceneletId: SceneletId): GameState {
  return {
    ...state,
    sceneletCooldowns: {
      ...state.sceneletCooldowns,
      [sceneletId]: state.time.cycle,
    },
  };
}

function meetsRequirements(scenelet: Scenelet, context: EventContext): boolean {
  const req = scenelet.requirements;
  const state = context.state;
  
  const lastTriggered = state.sceneletCooldowns[scenelet.id];
  if (lastTriggered !== undefined && scenelet.cooldown > 0) {
    const cyclesSince = state.time.cycle - lastTriggered;
    if (cyclesSince < scenelet.cooldown) return false;
  }
  
  if (req.context && req.context !== 'any' && req.context !== context.contextType) {
    return false;
  }
  
  if (req.minResources) {
    for (const [key, min] of Object.entries(req.minResources)) {
      const current = state.resources[key as keyof typeof state.resources];
      if (current < (min ?? 0)) return false;
    }
  }
  
  if (req.maxResources) {
    for (const [key, max] of Object.entries(req.maxResources)) {
      const current = state.resources[key as keyof typeof state.resources];
      if (current > (max ?? Infinity)) return false;
    }
  }
  
  if (req.requiredFlags) {
    for (const flag of req.requiredFlags) {
      if (!state.flags[flag]) return false;
    }
  }
  
  if (req.excludedFlags) {
    for (const flag of req.excludedFlags) {
      if (state.flags[flag]) return false;
    }
  }
  
  if (req.shipTags) {
    const shipTags = getShipTags(state, context.cardDefs);
    if (!req.shipTags.every(tag => shipTags.has(tag))) return false;
  }
  
  return true;
}

export function getShipTags(state: GameState, cardDefs: Map<string, CardDef>): Set<string> {
  const tags = new Set<string>();
  
  for (const instanceId of state.cards.deck) {
    const instance = state.cards.instances[instanceId];
    if (!instance) continue;
    
    const def = cardDefs.get(instance.cardDefId);
    if (!def) continue;
    
    for (const tag of def.tags) {
      tags.add(tag);
    }
    
    if (def.effects.grantsShipTags) {
      for (const tag of def.effects.grantsShipTags) {
        tags.add(tag);
      }
    }
  }
  
  for (const slot of Object.values(state.ship.modules)) {
    if (!slot) continue;
    const instance = state.cards.instances[slot];
    if (!instance) continue;
    
    const def = cardDefs.get(instance.cardDefId);
    if (!def) continue;
    
    for (const tag of def.tags) {
      tags.add(tag);
    }
    
    if (def.effects.grantsShipTags) {
      for (const tag of def.effects.grantsShipTags) {
        tags.add(tag);
      }
    }
  }
  
  return tags;
}

export function getCrewTags(state: GameState, cardDefs: Map<string, CardDef>): Set<string> {
  const tags = new Set<string>();
  
  for (const instanceId of state.cards.activeCrew) {
    const instance = state.cards.instances[instanceId];
    if (!instance) continue;
    
    const def = cardDefs.get(instance.cardDefId);
    if (!def) continue;
    
    for (const tag of def.tags) {
      tags.add(tag);
    }
  }
  
  return tags;
}

export function getCargoTags(state: GameState, cardDefs: Map<string, CardDef>): Set<string> {
  const tags = new Set<string>();
  
  for (const instanceId of [...state.cards.deck, ...state.cards.collection]) {
    const instance = state.cards.instances[instanceId];
    if (!instance) continue;
    
    const def = cardDefs.get(instance.cardDefId);
    if (!def || (def.type !== 'cargo' && def.type !== 'echo')) continue;
    
    for (const tag of def.tags) {
      tags.add(tag);
    }
  }
  
  return tags;
}

export function meetsChoiceRequirements(
  requirements: Partial<import('./types.js').SceneletRequirements> | undefined,
  state: GameState,
  cardDefs: Map<string, CardDef>
): boolean {
  if (!requirements) return true;
  
  if (requirements.minResources) {
    for (const [key, min] of Object.entries(requirements.minResources)) {
      const current = state.resources[key as keyof typeof state.resources];
      if (current < (min ?? 0)) return false;
    }
  }
  
  if (requirements.maxResources) {
    for (const [key, max] of Object.entries(requirements.maxResources)) {
      const current = state.resources[key as keyof typeof state.resources];
      if (current > (max ?? Infinity)) return false;
    }
  }
  
  if (requirements.requiredFlags) {
    for (const flag of requirements.requiredFlags) {
      if (!state.flags[flag]) return false;
    }
  }
  
  if (requirements.excludedFlags) {
    for (const flag of requirements.excludedFlags) {
      if (state.flags[flag]) return false;
    }
  }
  
  if (requirements.shipTags) {
    const shipTags = getShipTags(state, cardDefs);
    if (!requirements.shipTags.every(tag => shipTags.has(tag))) return false;
  }
  
  if (requirements.crewTags) {
    const crewTags = getCrewTags(state, cardDefs);
    if (!requirements.crewTags.every(tag => crewTags.has(tag))) return false;
  }
  
  if (requirements.cargoTags) {
    const cargoTags = getCargoTags(state, cardDefs);
    if (!requirements.cargoTags.every(tag => cargoTags.has(tag))) return false;
  }
  
  return true;
}

export function applyEffects(
  state: GameState,
  effects: SceneletEffects,
  cardDefs: Map<string, CardDef>
): GameState {
  let newState = { ...state };
  
  if (effects.resources) {
    newState.resources = {
      credits: Math.max(0, newState.resources.credits + (effects.resources.credits ?? 0)),
      fuel: Math.max(0, newState.resources.fuel + (effects.resources.fuel ?? 0)),
      supplies: Math.max(0, newState.resources.supplies + (effects.resources.supplies ?? 0)),
      hull: Math.max(0, Math.min(newState.ship.maxHull, newState.resources.hull + (effects.resources.hull ?? 0))),
      morale: Math.max(0, Math.min(100, newState.resources.morale + (effects.resources.morale ?? 0))),
    };
  }
  
  if (effects.setFlags) {
    newState.flags = { ...newState.flags, ...effects.setFlags };
  }
  
  if (effects.addCards) {
    const instances = { ...newState.cards.instances };
    const collection = [...newState.cards.collection];
    
    const currentCargo = countCargoItems(newState, cardDefs);
    const capacity = calculateCargoCapacity(newState, cardDefs);
    let cargoAdded = 0;
    
    for (const cardDefId of effects.addCards) {
      const def = cardDefs.get(cardDefId);
      if (!def) {
        if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
          console.warn(`[applyEffects] Unknown card definition: ${cardDefId}`);
        }
        continue;
      }
      
      if ((def.type === 'cargo' || def.type === 'echo') && currentCargo + cargoAdded >= capacity) {
        continue;
      }
      
      const instanceId = `card-${Date.now()}-${Math.random().toString(36).slice(2)}` as CardInstanceId;
      instances[instanceId] = {
        instanceId,
        cardDefId,
        level: 1,
        condition: 100,
        mods: [],
        acquiredAt: { cycle: newState.time.cycle },
      };
      collection.push(instanceId);
      
      if (def.type === 'cargo' || def.type === 'echo') {
        cargoAdded++;
      }
    }
    
    newState.cards = { ...newState.cards, instances, collection };
  }
  
  if (effects.removeCards) {
    const instances = { ...newState.cards.instances };
    let collection = [...newState.cards.collection];
    let deck = [...newState.cards.deck];
    
    for (const instanceId of effects.removeCards) {
      delete instances[instanceId];
      collection = collection.filter(id => id !== instanceId);
      deck = deck.filter(id => id !== instanceId);
    }
    
    newState.cards = { ...newState.cards, instances, collection, deck };
  }
  
  if (effects.removeCargoByTag) {
    const { tag, count } = effects.removeCargoByTag;
    const instances = { ...newState.cards.instances };
    let collection = [...newState.cards.collection];
    let deck = [...newState.cards.deck];
    
    const cargoToRemove: CardInstanceId[] = [];
    for (const instanceId of [...deck, ...collection]) {
      if (cargoToRemove.length >= count) break;
      
      const instance = instances[instanceId];
      if (!instance) continue;
      
      const def = cardDefs.get(instance.cardDefId);
      if (!def || (def.type !== 'cargo' && def.type !== 'echo')) continue;
      
      if (def.tags.includes(tag as import('./types.js').CardTag)) {
        cargoToRemove.push(instanceId);
      }
    }
    
    for (const instanceId of cargoToRemove) {
      delete instances[instanceId];
      collection = collection.filter(id => id !== instanceId);
      deck = deck.filter(id => id !== instanceId);
    }
    
    newState.cards = { ...newState.cards, instances, collection, deck };
  }
  
  if (effects.damage) {
    if (effects.damage.hull) {
      newState.resources = {
        ...newState.resources,
        hull: Math.max(0, newState.resources.hull - effects.damage.hull),
      };
    }
    if (effects.damage.morale) {
      newState.resources = {
        ...newState.resources,
        morale: Math.max(0, newState.resources.morale - effects.damage.morale),
      };
    }
  }
  
  if (effects.addChronicle) {
    const entry: ChronicleEntry = {
      id: createId.chronicleEntry(`event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      type: 'encounter',
      timestamp: { cycle: newState.time.cycle },
      title: effects.addChronicle.title,
      text: effects.addChronicle.text,
      tags: ['event'],
    };
    newState.chronicle = [...newState.chronicle, entry];
  }
  
  if (effects.reputation) {
    const { faction, amount } = effects.reputation;
    const factionState = newState.world.factions[faction];
    if (factionState) {
      newState.world = {
        ...newState.world,
        factions: {
          ...newState.world.factions,
          [faction]: {
            ...factionState,
            reputation: Math.max(-100, Math.min(100, factionState.reputation + amount)),
          },
        },
      };
    }
  }
  
  if (effects.discoverPorts) {
    const knownPorts = [...newState.world.knownPorts];
    for (const portId of effects.discoverPorts) {
      if (!knownPorts.includes(portId) && newState.world.ports[portId]) {
        knownPorts.push(portId);
      }
    }
    newState.world = {
      ...newState.world,
      knownPorts,
    };
  }
  
  return newState;
}

export function createSeededRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}
