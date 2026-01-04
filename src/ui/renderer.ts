import type { GameState, CardDef, PortState, CardInstance, AchievementId } from '../core/types.js';
import type { GameController } from '../core/controller.js';
import type { TriggeredEvent } from '../core/events.js';
import { ACHIEVEMENTS, getAchievement } from '../content/achievements/index.js';
import { calculateFuelCost, calculateCargoCapacity, countCargoItems } from '../core/simulate.js';
import { meetsChoiceRequirements } from '../core/events.js';
import { DEFAULT_CONFIG } from '../core/types.js';

export type ViewMode = 'narrative' | 'hold' | 'crew' | 'ship' | 'market' | 'travel' | 'chronicle' | 'achievements';

export interface UIState {
  viewMode: ViewMode;
  selectedCardId: string | null;
  achievementToast: AchievementId | null;
  actionToast: string | null;
  settingsOpen: boolean;
  chronicleFilter: string | null;
}

export function createRenderer(
  container: HTMLElement,
  controller: GameController,
  cardDefs: Map<string, CardDef>
) {
  let uiState: UIState = {
    viewMode: 'narrative',
    selectedCardId: null,
    achievementToast: null,
    actionToast: null,
    settingsOpen: false,
    chronicleFilter: null,
  };

  const achievementQueue: AchievementId[] = [];
  let achievementToastActive = false;
  let lastEventId: string | null = null;

  function setView(mode: ViewMode) {
    uiState = { ...uiState, viewMode: mode };
    render();
  }

  function queueAchievementToast(achievementId: AchievementId) {
    achievementQueue.push(achievementId);
    processAchievementQueue();
  }

  function processAchievementQueue() {
    if (achievementToastActive || achievementQueue.length === 0) return;
    
    achievementToastActive = true;
    const nextId = achievementQueue.shift()!;
    uiState = { ...uiState, achievementToast: nextId };
    render();
    
    setTimeout(() => {
      uiState = { ...uiState, achievementToast: null };
      achievementToastActive = false;
      render();
      processAchievementQueue();
    }, 3000);
  }
  
  function showActionToast(message: string) {
    uiState = { ...uiState, actionToast: message };
    render();
    setTimeout(() => {
      uiState = { ...uiState, actionToast: null };
      render();
    }, 2000);
  }

  function render() {
    const state = controller.getState();
    const event = controller.getCurrentEvent();
    const journeyState = controller.getJourneyState();
    const isGameOver = controller.isGameOver();
    
    const newAchievements = controller.getNewAchievements();
    if (newAchievements.length > 0) {
      controller.clearNewAchievements();
      for (const id of newAchievements) {
        queueAchievementToast(id);
      }
    }

    if (isGameOver) {
      container.innerHTML = renderGameOver(state);
      attachEventListeners();
      return;
    }

    const isNewEvent = event && event.scenelet.id !== lastEventId;
    lastEventId = event?.scenelet.id ?? null;

    container.innerHTML = `
      <div class="game-container">
        ${renderStatusBar(state, journeyState)}
        ${uiState.achievementToast ? renderAchievementToast(uiState.achievementToast) : ''}
        ${uiState.actionToast ? renderActionToast(uiState.actionToast) : ''}
        <main class="main-content">
          ${event ? renderEvent(event) : renderMainView(state, journeyState)}
        </main>
        ${!event && !journeyState ? renderNavBar() : ''}
      </div>
      ${uiState.settingsOpen ? renderSettingsModal() : ''}
    `;

    attachEventListeners();
    
    if (isNewEvent) {
      animateEventText();
    }
  }
  
  function renderAchievementToast(achievementId: AchievementId): string {
    const achievement = getAchievement(achievementId);
    if (!achievement) return '';
    
    return `
      <div class="achievement-toast">
        <span class="achievement-icon">${achievement.icon}</span>
        <div class="achievement-info">
          <div class="achievement-label">Achievement Unlocked!</div>
          <div class="achievement-name">${achievement.name}</div>
        </div>
      </div>
    `;
  }
  
  function renderActionToast(message: string): string {
    return `
      <div class="action-toast">
        ${message}
      </div>
    `;
  }

  function renderGameOver(state: GameState): string {
    const reason = state.resources.hull <= 0 
      ? 'Your ship has been destroyed.' 
      : 'Your crew has lost all hope.';
    
    return `
      <div class="game-container">
        <div class="view-gameover">
          <h1>Game Over</h1>
          <p class="gameover-reason">${reason}</p>
          <div class="gameover-stats">
            <p>Jumps completed: ${state.time.jumpsCompleted}</p>
            <p>Credits earned: ${state.stats.totalCreditsEarned}</p>
            <p>Contracts completed: ${state.stats.contractsCompleted}</p>
            <p>Ports visited: ${state.stats.portsVisited}</p>
          </div>
          <button class="btn btn-primary" data-action="restart">Start New Game</button>
        </div>
      </div>
    `;
  }

  function renderStatusBar(state: GameState, journeyState: ReturnType<typeof controller.getJourneyState>): string {
    const port = state.world.ports[state.world.currentLocation];
    const locationText = journeyState 
      ? `Jumping to ${state.world.ports[journeyState.destination]?.name ?? 'Unknown'}`
      : port?.name ?? 'Unknown';

    return `
      <header class="status-bar">
        <div class="status-row">
          <div class="status-resources">
            <span class="resource" title="Credits">¢${Math.floor(state.resources.credits)}</span>
            <span class="resource" title="Fuel">⛽${Math.floor(state.resources.fuel)}</span>
            <span class="resource" title="Supplies">📦${Math.floor(state.resources.supplies)}</span>
            <span class="resource" title="Hull">🛡${Math.floor(state.resources.hull)}%</span>
          </div>
          <button class="settings-btn" data-action="settings" title="Settings">⚙</button>
        </div>
        <div class="status-location">
          <span class="location-name">${locationText}</span>
          <span class="cycle-count">Cycle ${state.time.cycle}</span>
        </div>
      </header>
    `;
  }

  function renderNavBar(): string {
    const tabs: { mode: ViewMode; label: string; icon: string }[] = [
      { mode: 'narrative', label: 'Log', icon: '&#x1F4DC;' },
      { mode: 'hold', label: 'Hold', icon: '&#x1F4E6;' },
      { mode: 'crew', label: 'Crew', icon: '&#x1F465;' },
      { mode: 'ship', label: 'Ship', icon: '&#x2699;' },
      { mode: 'market', label: 'Trade', icon: '&#x1F4B0;' },
      { mode: 'travel', label: 'Jump', icon: '&#x1F680;' },
      { mode: 'achievements', label: 'Goals', icon: '&#x1F3C6;' },
    ];

    return `
      <nav class="nav-bar">
        ${tabs.map(tab => `
          <button 
            class="nav-btn ${uiState.viewMode === tab.mode ? 'active' : ''}"
            data-view="${tab.mode}"
          >
            <span class="nav-icon">${tab.icon}</span>
            <span class="nav-label">${tab.label}</span>
          </button>
        `).join('')}
      </nav>
    `;
  }

  function renderMainView(state: GameState, journeyState: ReturnType<typeof controller.getJourneyState>): string {
    if (journeyState) {
      return renderJourneyProgress(state, journeyState);
    }

    switch (uiState.viewMode) {
      case 'narrative': return renderNarrative(state);
      case 'hold': return renderHold(state);
      case 'crew': return renderCrew(state);
      case 'ship': return renderShip(state);
      case 'market': return renderMarket(state);
      case 'travel': return renderTravel(state);
      case 'chronicle': return renderChronicle(state);
      case 'achievements': return renderAchievements(state);
      default: return renderNarrative(state);
    }
  }

  function renderJourneyProgress(state: GameState, journeyState: NonNullable<ReturnType<typeof controller.getJourneyState>>): string {
    const dest = state.world.ports[journeyState.destination];
    const progress = journeyState.totalEvents > 0 
      ? ((journeyState.totalEvents - journeyState.eventsRemaining) / journeyState.totalEvents) * 100
      : 100;

    return `
      <div class="view-journey">
        <h2>In Transit</h2>
        <p class="journey-dest">Destination: ${dest?.name ?? 'Unknown'}</p>
        <div class="journey-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${progress}%"></div>
          </div>
          <p class="progress-text">${journeyState.eventsRemaining} events remaining</p>
        </div>
        <p class="journey-flavor">The void stretches. The hold hums.</p>
      </div>
    `;
  }

  function renderNarrative(state: GameState): string {
    const recentChronicle = state.chronicle.slice(-5).reverse();
    const isFirstTime = state.time.cycle === 0 && state.time.jumpsCompleted === 0;
    
    return `
      <div class="view-narrative">
        ${isFirstTime ? `
          <div class="tutorial-hint">
            <strong>Welcome, Captain.</strong> The Holdfast is yours now.
            <br><br>
            Three centuries since the Silence, and we still fly. Buy cargo at <em>Trade</em>, 
            sell it for profit elsewhere. Use <em>Jump</em> to travel between ports. 
            Watch your fuel, supplies, and hull.
            <br><br>
            The void waits. Time to fill the hold.
          </div>
        ` : ''}
        <div class="narrative-entries">
          ${recentChronicle.map(entry => `
            <article class="chronicle-entry">
              <header class="entry-header">
                <h3>${entry.title}</h3>
                <time>Cycle ${entry.timestamp.cycle}</time>
              </header>
              <p>${entry.text}</p>
            </article>
          `).join('')}
        </div>
        
        <div class="narrative-actions">
          <button class="btn btn-primary" data-action="trigger-event">See what the port has to offer</button>
        </div>
      </div>
    `;
  }

  function renderHold(state: GameState): string {
    const cargoInstances = [...state.cards.collection, ...state.cards.deck]
      .map(id => state.cards.instances[id])
      .filter((inst): inst is CardInstance => !!inst)
      .filter(inst => {
        const def = cardDefs.get(inst.cardDefId);
        return def?.type === 'cargo' || def?.type === 'echo';
      });

    const currentCargo = cargoInstances.length;
    const cargoCapacity = calculateCargoCapacity(state, cardDefs);

    return `
      <div class="view-hold">
        <h2>Cargo Hold (${currentCargo}/${cargoCapacity})</h2>
        ${cargoInstances.length === 0 ? `
          <p class="empty-state">The hold is empty. Trade awaits.</p>
        ` : `
          <ul class="card-list">
            ${cargoInstances.map(inst => renderCardItem(inst, state)).join('')}
          </ul>
        `}
      </div>
    `;
  }

  function renderCrew(state: GameState): string {
    const crewInstances = state.cards.activeCrew
      .map(id => state.cards.instances[id])
      .filter((inst): inst is CardInstance => !!inst);

    return `
      <div class="view-crew">
        <h2>Crew Manifest</h2>
        <div class="morale-display">
          <span>Morale:</span>
          <div class="morale-bar">
            <div class="morale-fill" style="width: ${state.resources.morale}%"></div>
          </div>
          <span>${Math.floor(state.resources.morale)}%</span>
        </div>
        ${crewInstances.length === 0 ? `
          <p class="empty-state">No crew aboard. The hold runs on silence.</p>
        ` : `
          <ul class="card-list">
            ${crewInstances.map(inst => renderCrewItem(inst)).join('')}
          </ul>
        `}
      </div>
    `;
  }

  function renderShip(state: GameState): string {
    const moduleSlots = Object.entries(state.ship.modules) as [keyof typeof state.ship.modules, string | null][];
    
    const uninstalledModules = [...state.cards.collection, ...state.cards.deck]
      .map(id => state.cards.instances[id])
      .filter((inst): inst is CardInstance => {
        if (!inst) return false;
        const def = cardDefs.get(inst.cardDefId);
        return def?.type === 'module';
      });

    const cargoCapacity = calculateCargoCapacity(state, cardDefs);
    const currentCargo = countCargoItems(state, cardDefs);

    return `
      <div class="view-ship">
        <h2>${state.ship.name}</h2>
        <p class="ship-class">${state.ship.class}</p>
        
        <div class="ship-stats">
          <div class="stat">
            <span class="stat-label">Hull</span>
            <div class="hull-bar">
              <div class="hull-fill" style="width: ${(state.resources.hull / state.ship.maxHull) * 100}%"></div>
            </div>
            <span class="stat-value">${Math.floor(state.resources.hull)} / ${state.ship.maxHull}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Cargo</span>
            <span class="stat-value">${currentCargo} / ${cargoCapacity}</span>
          </div>
        </div>

        <h3>Installed Modules</h3>
        <ul class="module-slots">
          ${moduleSlots.map(([slot, instanceId]) => {
            const instance = instanceId ? state.cards.instances[instanceId as keyof typeof state.cards.instances] : null;
            const def = instance ? cardDefs.get(instance.cardDefId) : null;
            return `
              <li class="module-slot ${instance ? 'occupied' : 'empty'}">
                <div class="slot-info">
                  <span class="slot-name">${formatSlotName(slot)}</span>
                  ${def ? `<span class="module-name">${def.name}</span>` : '<span class="empty-label">Empty</span>'}
                </div>
                ${instance ? `
                  <button class="btn btn-small" data-action="uninstall-module" data-slot="${slot}">
                    Uninstall
                  </button>
                ` : ''}
              </li>
            `;
          }).join('')}
        </ul>

        ${uninstalledModules.length > 0 ? `
          <h3>Available Modules</h3>
          <ul class="module-list">
            ${uninstalledModules.map(inst => {
              const def = cardDefs.get(inst.cardDefId);
              if (!def || !def.installRequirements) return '';
              const slotType = def.installRequirements.slotType;
              const compatibleSlots = moduleSlots
                .filter(([slot, occupant]) => !occupant && slotMatchesType(slot, slotType))
                .map(([slot]) => slot);
              return `
                <li class="module-item">
                  <div class="module-info">
                    <span class="module-name">${def.name}</span>
                    <span class="module-slot-type">${slotType}</span>
                  </div>
                  <p class="module-desc">${def.description}</p>
                  ${compatibleSlots.length > 0 ? `
                    <div class="install-actions">
                      ${compatibleSlots.map(slot => `
                        <button class="btn btn-small" data-action="install-module" data-instance="${inst.instanceId}" data-slot="${slot}">
                          Install in ${formatSlotName(slot)}
                        </button>
                      `).join('')}
                    </div>
                  ` : '<p class="no-slots">No compatible empty slots</p>'}
                </li>
              `;
            }).join('')}
          </ul>
        ` : ''}
      </div>
    `;
  }

  function formatSlotName(slot: string): string {
    return slot.replace(/([0-9]+)/g, ' $1').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
  }

  function slotMatchesType(slot: string, slotType: string): boolean {
    if (slot.startsWith('cargo') && slotType === 'cargo') return true;
    if (slot.startsWith('utility') && slotType === 'utility') return true;
    if (slot === slotType) return true;
    return false;
  }

  function renderMarket(state: GameState): string {
    const port = state.world.ports[state.world.currentLocation];
    if (!port) return '<div class="view-market"><p>Error: Unknown location</p></div>';

    const activeContracts = state.cards.activeContracts
      .map(id => state.cards.instances[id])
      .filter((inst): inst is CardInstance => !!inst);

    return `
      <div class="view-market">
        <h2>${port.name} Market</h2>
        <p class="port-desc">${port.description}</p>
        
        <h3>Available Cargo</h3>
        <ul class="market-list">
          ${port.availableCards.map(defId => {
            const def = cardDefs.get(defId);
            if (!def || (def.type !== 'cargo' && def.type !== 'module')) return '';
            const price = Math.ceil((def.baseValue ?? 10) * (port.marketModifiers[defId] ?? 1));
            return `
              <li class="market-item">
                <div class="item-info">
                  <span class="item-name">${def.name}</span>
                  <span class="item-price">${price} cr</span>
                </div>
                <button class="btn btn-small" data-action="buy" data-card="${defId}" 
                  ${state.resources.credits < price ? 'disabled' : ''}>Buy</button>
              </li>
            `;
          }).join('')}
        </ul>

        <h3>Available Crew</h3>
        <ul class="market-list">
          ${port.availableCards.map(defId => {
            const def = cardDefs.get(defId);
            if (!def || def.type !== 'crew') return '';
            const price = def.baseValue ?? 50;
            return `
              <li class="market-item">
                <div class="item-info">
                  <span class="item-name">${def.name}</span>
                  <span class="item-price">${price} cr</span>
                </div>
                <button class="btn btn-small" data-action="hire" data-card="${defId}"
                  ${state.resources.credits < price ? 'disabled' : ''}>Hire</button>
              </li>
            `;
          }).join('')}
        </ul>

        <h3>Contracts</h3>
        ${port.availableContracts.length === 0 && activeContracts.length === 0 ? `
          <p class="empty-state">No contracts available at this port.</p>
        ` : `
          <ul class="market-list">
            ${port.availableContracts.map(defId => {
              const def = cardDefs.get(defId);
              if (!def || def.type !== 'contract' || !def.contractTerms) return '';
              const terms = def.contractTerms;
              const destPort = state.world.ports[terms.destination];
              const destinationKnown = state.world.knownPorts.includes(terms.destination);
              if (!destinationKnown) return '';
              const alreadyAccepted = activeContracts.some(c => c.cardDefId === defId);
              return `
                <li class="market-item contract-item">
                  <div class="item-info">
                    <span class="item-name">${def.name}</span>
                    <span class="item-reward">+${terms.reward.credits ?? 0} cr</span>
                  </div>
                  <p class="contract-desc">${def.description}</p>
                  <p class="contract-terms">
                    Destination: ${destPort?.name ?? 'Unknown'}
                    ${terms.cargoRequired ? ` | Requires: ${terms.cargoRequired.quantity}x ${cardDefs.get(terms.cargoRequired.cardDefId)?.name ?? 'cargo'}` : ''}
                    | Time: ${terms.cycleLimit} cycles
                  </p>
                  <button class="btn btn-small" data-action="accept-contract" data-card="${defId}"
                    ${alreadyAccepted ? 'disabled' : ''}>
                    ${alreadyAccepted ? 'Active' : 'Accept'}
                  </button>
                </li>
              `;
            }).join('')}
            ${activeContracts.map(inst => {
              const def = cardDefs.get(inst.cardDefId);
              if (!def || !def.contractTerms) return '';
              const terms = def.contractTerms;
              const destPort = state.world.ports[terms.destination];
              const atDestination = state.world.currentLocation === terms.destination;
              const hasRequiredCargo = !terms.cargoRequired || (() => {
                const owned = [...state.cards.deck, ...state.cards.collection]
                  .map(id => state.cards.instances[id])
                  .filter(c => c && c.cardDefId === terms.cargoRequired!.cardDefId);
                return owned.length >= terms.cargoRequired!.quantity;
              })();
              const canComplete = atDestination && hasRequiredCargo;
              return `
                <li class="market-item contract-item contract-active">
                  <div class="item-info">
                    <span class="item-name">${def.name}</span>
                    <span class="item-cycles">${inst.cyclesRemaining ?? '?'} cycles left</span>
                  </div>
                  <p class="contract-desc">${def.description}</p>
                  <p class="contract-terms">
                    Destination: ${destPort?.name ?? 'Unknown'} ${atDestination ? '(HERE)' : ''}
                    ${terms.cargoRequired ? ` | Requires: ${terms.cargoRequired.quantity}x ${cardDefs.get(terms.cargoRequired.cardDefId)?.name ?? 'cargo'} ${hasRequiredCargo ? '(HAVE)' : '(NEED)'}` : ''}
                  </p>
                  <div class="contract-actions">
                    <button class="btn btn-small btn-primary" data-action="complete-contract" data-instance="${inst.instanceId}"
                      ${!canComplete ? 'disabled' : ''}>
                      Complete (+${terms.reward.credits ?? 0} cr)
                    </button>
                    <button class="btn btn-small btn-danger" data-action="abandon-contract" data-instance="${inst.instanceId}">
                      Abandon
                    </button>
                  </div>
                </li>
              `;
            }).join('')}
          </ul>
        `}

        <h3>Services</h3>
        <div class="services">
          <button class="btn" data-action="refuel" ${state.resources.credits < 30 ? 'disabled' : ''}>
            Refuel (+10) - 30 cr
          </button>
          <button class="btn" data-action="resupply" ${state.resources.credits < 20 ? 'disabled' : ''}>
            Resupply (+10) - 20 cr
          </button>
          <button class="btn" data-action="repair" ${state.resources.credits < 50 || state.resources.hull >= 100 ? 'disabled' : ''}>
            Repair (+10) - 50 cr
          </button>
        </div>
      </div>
    `;
  }

  function renderTravel(state: GameState): string {
    const knownPorts = state.world.knownPorts
      .filter(id => id !== state.world.currentLocation)
      .map(id => state.world.ports[id])
      .filter((p): p is PortState => !!p);

    const fuelCost = calculateFuelCost(state, cardDefs, DEFAULT_CONFIG);

    return `
      <div class="view-travel">
        <h2>Jump Navigation</h2>
        <p>Current fuel: ${Math.floor(state.resources.fuel)} (${fuelCost} per jump)</p>
        
        <ul class="destination-list">
          ${knownPorts.map(port => `
            <li class="destination-item">
              <div class="dest-info">
                <span class="dest-name">${port.name}</span>
                <span class="dest-status status-${port.status}">${port.status}</span>
              </div>
              <p class="dest-desc">${port.description}</p>
              <button class="btn btn-primary" data-action="travel" data-dest="${port.id}"
                ${state.resources.fuel < fuelCost ? 'disabled' : ''}>
                Jump (${fuelCost} fuel)
              </button>
            </li>
          `).join('')}
        </ul>
      </div>
    `;
  }

  function renderChronicle(state: GameState): string {
    const portsWithEntries = new Set<string>();
    for (const entry of state.chronicle) {
      if (entry.refs?.portId) {
        portsWithEntries.add(entry.refs.portId);
      }
    }
    
    const portOptions = Array.from(portsWithEntries)
      .map(portId => state.world.ports[portId as keyof typeof state.world.ports])
      .filter(Boolean)
      .map(port => ({ id: port!.id, name: port!.name }));

    const filteredEntries = uiState.chronicleFilter
      ? state.chronicle.filter(entry => entry.refs?.portId === uiState.chronicleFilter)
      : state.chronicle;

    return `
      <div class="view-chronicle">
        <h2>Captain's Chronicle</h2>
        ${portOptions.length > 0 ? `
          <div class="chronicle-filter">
            <select data-action="chronicle-filter">
              <option value="">All Entries</option>
              ${portOptions.map(p => `
                <option value="${p.id}" ${uiState.chronicleFilter === p.id ? 'selected' : ''}>${p.name}</option>
              `).join('')}
            </select>
          </div>
        ` : ''}
        <div class="chronicle-full">
          ${filteredEntries.length === 0 ? `
            <p class="empty-state">No entries match this filter.</p>
          ` : filteredEntries.map(entry => `
            <article class="chronicle-entry">
              <header>
                <h3>${entry.title}</h3>
                <time>Cycle ${entry.timestamp.cycle}</time>
              </header>
              <p>${entry.text}</p>
            </article>
          `).reverse().join('')}
        </div>
      </div>
    `;
  }

  function renderAchievements(state: GameState): string {
    const unlocked = state.achievements.unlocked;
    const unlockedCount = unlocked.length;
    const totalCount = ACHIEVEMENTS.filter(a => !a.hidden).length;
    
    return `
      <div class="view-achievements">
        <h2>Achievements</h2>
        <p class="achievement-progress">${unlockedCount} / ${totalCount} unlocked</p>
        <ul class="achievement-list">
          ${ACHIEVEMENTS.map(achievement => {
            const isUnlocked = unlocked.includes(achievement.id);
            const isHidden = achievement.hidden && !isUnlocked;
            
            if (isHidden) return '';
            
            return `
              <li class="achievement-item ${isUnlocked ? 'unlocked' : 'locked'}">
                <span class="achievement-icon">${isUnlocked ? achievement.icon : '?'}</span>
                <div class="achievement-details">
                  <span class="achievement-name">${achievement.name}</span>
                  <span class="achievement-desc">${achievement.description}</span>
                </div>
              </li>
            `;
          }).join('')}
        </ul>
      </div>
    `;
  }

  function renderEvent(event: TriggeredEvent): string {
    const passage = event.scenelet.passages[event.passageIndex];
    if (!passage) return '<p>Error: Invalid passage</p>';
    const state = controller.getState();

    return `
      <div class="view-event">
        <h2>${event.scenelet.title}</h2>
        <div class="event-text">
          ${passage.text.split('\n\n').map(p => `<p>${p}</p>`).join('')}
        </div>
        ${passage.choices && passage.choices.length > 0 ? `
          <div class="event-choices">
            ${passage.choices.map((choice, i) => {
              const canChoose = meetsChoiceRequirements(choice.requirements, state, cardDefs);
              return `
              <button class="btn btn-choice ${!canChoose ? 'btn-disabled' : ''}" 
                data-action="event-choice" 
                data-choice="${i}"
                ${!canChoose ? 'disabled title="Requirements not met"' : ''}>
                ${choice.text}
              </button>
            `;
            }).join('')}
          </div>
        ` : `
          <button class="btn btn-primary" data-action="event-dismiss">Continue</button>
        `}
      </div>
    `;
  }

  function renderCardItem(inst: CardInstance, state: GameState): string {
    const def = cardDefs.get(inst.cardDefId);
    if (!def) return '';

    const isEquipped = state.cards.deck.includes(inst.instanceId);
    const port = state.world.ports[state.world.currentLocation];
    const basePrice = def.baseValue ?? 10;
    const modifier = port?.marketModifiers[inst.cardDefId] ?? 1;
    const sellPrice = Math.floor(basePrice * modifier * 0.7 * (inst.condition / 100));

    return `
      <li class="card-item ${isEquipped ? 'equipped' : ''} rarity-${def.rarity}">
        <div class="card-info">
          <span class="card-name">${def.name}</span>
          <span class="card-rarity">${def.rarity}</span>
          <span class="card-condition">${inst.condition}%</span>
        </div>
        <p class="card-desc">${def.description}</p>
        <div class="card-actions">
          <button class="btn btn-small" data-action="sell" data-instance="${inst.instanceId}">Sell (${sellPrice} cr)</button>
        </div>
      </li>
    `;
  }

  function renderCrewItem(inst: CardInstance): string {
    const def = cardDefs.get(inst.cardDefId);
    if (!def) return '';

    return `
      <li class="card-item crew-item rarity-${def.rarity}">
        <div class="card-info">
          <span class="card-name">${def.name}</span>
          <span class="card-rarity">${def.rarity}</span>
        </div>
        <p class="card-desc">${def.description}</p>
        ${def.flavorText ? `<p class="card-flavor">${def.flavorText}</p>` : ''}
      </li>
    `;
  }

  function renderSettingsModal(): string {
    const meta = controller.getMetaState();
    const state = controller.getState();
    
    return `
      <div class="modal-overlay" data-action="close-settings">
        <div class="modal" onclick="event.stopPropagation()">
          <div class="modal-header">
            <h2>Settings</h2>
            <button class="modal-close" data-action="close-settings">&times;</button>
          </div>
          <div class="modal-body">
            <div class="settings-section">
              <h3>Lifetime Stats</h3>
              <div class="lifetime-stats">
                <p>Games Started <span>${meta.lifetime.gamesStarted}</span></p>
                <p>Total Jumps <span>${meta.lifetime.totalJumps + state.time.jumpsCompleted}</span></p>
                <p>Achievements <span>${meta.achievements.unlocked.length} / ${ACHIEVEMENTS.length}</span></p>
              </div>
            </div>
            
            <div class="settings-section">
              <h3>Save Data</h3>
              <p>Export your save to back it up or transfer to another device.</p>
              <div class="settings-buttons">
                <button class="btn" data-action="export-save">Export Save</button>
                <button class="btn" data-action="import-save">Import Save</button>
              </div>
            </div>
            
            <div class="settings-section">
              <h3>New Game</h3>
              <p>Start fresh. Your achievements will be kept.</p>
              <div class="settings-buttons">
                <button class="btn btn-danger" data-action="new-game">New Game</button>
              </div>
            </div>
            
            <div class="settings-section">
              <h3>Reset Everything</h3>
              <p>Delete all data including achievements. This cannot be undone.</p>
              <div class="settings-buttons">
                <button class="btn btn-danger" data-action="clear-all">Clear All Data</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function attachEventListeners() {
    container.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mode = (e.currentTarget as HTMLElement).dataset.view as ViewMode;
        setView(mode);
      });
    });

    container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const el = e.currentTarget as HTMLElement;
        const action = el.dataset.action;

        switch (action) {
          case 'trigger-event':
            controller.triggerPortEvent();
            render();
            break;
          case 'event-choice':
            const choiceIdx = parseInt(el.dataset.choice ?? '0', 10);
            controller.resolveEventChoice(choiceIdx);
            render();
            break;
          case 'event-dismiss':
            controller.resolveEventChoice(-1);
            render();
            break;
          case 'buy': {
            const result = controller.dispatch({
              type: 'TRADE_BUY',
              payload: { cardDefId: el.dataset.card as any, quantity: 1 }
            });
            if (result.message) showActionToast(result.message);
            render();
            break;
          }
          case 'hire': {
            const result = controller.dispatch({
              type: 'CREW_HIRE',
              payload: { cardDefId: el.dataset.card as any }
            });
            if (result.message) showActionToast(result.message);
            render();
            break;
          }
          case 'sell': {
            const result = controller.dispatch({
              type: 'TRADE_SELL',
              payload: { instanceId: el.dataset.instance as any }
            });
            if (result.message) showActionToast(result.message);
            render();
            break;
          }
          case 'travel': {
            const result = controller.travel(el.dataset.dest as any);
            if (result.message) showActionToast(result.message);
            render();
            break;
          }
          case 'refuel': {
            const result = controller.dispatch({ type: 'REFUEL', payload: { amount: 10 } });
            if (result.message) showActionToast(result.message);
            render();
            break;
          }
          case 'resupply': {
            const result = controller.dispatch({ type: 'RESUPPLY', payload: { amount: 10 } });
            if (result.message) showActionToast(result.message);
            render();
            break;
          }
          case 'repair':
            controller.dispatch({ type: 'REPAIR', payload: { amount: 10 } });
            render();
            break;
          case 'restart':
            controller.reset();
            render();
            break;
          case 'settings':
            uiState = { ...uiState, settingsOpen: true };
            render();
            break;
          case 'close-settings':
            uiState = { ...uiState, settingsOpen: false };
            render();
            break;
          case 'export-save':
            controller.exportSave();
            showActionToast('Save exported');
            break;
          case 'import-save':
            controller.importSave(
              () => {
                uiState = { ...uiState, settingsOpen: false };
                showActionToast('Save imported successfully');
              },
              (msg) => showActionToast(`Import failed: ${msg}`)
            );
            break;
          case 'new-game':
            if (confirm('Start a new game? Your current progress will be lost, but achievements will be kept.')) {
              controller.reset();
              uiState = { ...uiState, settingsOpen: false };
              render();
            }
            break;
          case 'clear-all':
            if (confirm('Delete ALL data including achievements? This cannot be undone!')) {
              if (confirm('Are you absolutely sure? This will erase everything.')) {
                controller.clearAll();
                uiState = { ...uiState, settingsOpen: false };
                render();
              }
            }
            break;
          case 'accept-contract': {
            const result = controller.dispatch({
              type: 'CONTRACT_ACCEPT',
              payload: { cardDefId: el.dataset.card as any }
            });
            if (result.message) showActionToast(result.message);
            render();
            break;
          }
          case 'complete-contract': {
            const result = controller.dispatch({
              type: 'CONTRACT_COMPLETE',
              payload: { instanceId: el.dataset.instance as any }
            });
            if (result.message) showActionToast(result.message);
            render();
            break;
          }
          case 'abandon-contract': {
            const result = controller.dispatch({
              type: 'CONTRACT_ABANDON',
              payload: { instanceId: el.dataset.instance as any }
            });
            if (result.message) showActionToast(result.message);
            render();
            break;
          }
          case 'install-module': {
            const result = controller.dispatch({
              type: 'MODULE_INSTALL',
              payload: { 
                instanceId: el.dataset.instance as any,
                slot: el.dataset.slot as any
              }
            });
            if (result.message) showActionToast(result.message);
            render();
            break;
          }
          case 'uninstall-module': {
            const result = controller.dispatch({
              type: 'MODULE_UNINSTALL',
              payload: { slot: el.dataset.slot as any }
            });
            if (result.message) showActionToast(result.message);
            render();
            break;
          }
        }
      });
    });

    container.querySelectorAll('select[data-action="chronicle-filter"]').forEach(select => {
      select.addEventListener('change', (e) => {
        const value = (e.currentTarget as HTMLSelectElement).value;
        uiState = { ...uiState, chronicleFilter: value || null };
        render();
      });
    });
  }

  controller.subscribe(() => {
    render();
  });

  function typewriterEffect(element: HTMLElement, text: string, speed = 30): Promise<void> {
    return new Promise((resolve) => {
      element.textContent = '';
      let index = 0;
      
      function typeChar() {
        if (index < text.length) {
          element.textContent += text[index];
          index++;
          setTimeout(typeChar, speed);
        } else {
          resolve();
        }
      }
      
      typeChar();
    });
  }

  async function animateEventText() {
    const eventTextEl = container.querySelector('.event-text');
    if (!eventTextEl) return;
    
    const paragraphs = Array.from(eventTextEl.querySelectorAll('p'));
    for (const p of paragraphs) {
      const originalText = p.textContent || '';
      await typewriterEffect(p as HTMLElement, originalText, 25);
    }
  }

  return {
    render,
    setView,
  };
}
