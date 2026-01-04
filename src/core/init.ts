import {
  type GameState,
  createId,
} from './types.js';

export function createInitialState(): GameState {
  const portHavenPrime = createId.port('port_haven_prime');
  const factionTraders = createId.faction('faction_free_traders');
  
  return {
    schemaVersion: 3,
    
    time: {
      cycle: 0,
      jumpsCompleted: 0,
    },
    
    ship: {
      name: 'Holdfast',
      class: 'Light Freighter',
      maxHull: 100,
      modules: {
        sensor: null,
        defense: null,
        cargo1: null,
        cargo2: null,
        propulsion: null,
        utility1: null,
        utility2: null,
      },
      baseCargoCapacity: 10,
    },
    
    resources: {
      credits: 100,
      fuel: 35,
      supplies: 20,
      hull: 100,
      morale: 75,
    },
    
    cards: {
      instances: {},
      collection: [],
      deck: [],
      activeCrew: [],
      activeContracts: [],
    },
    
    world: {
      currentLocation: portHavenPrime,
      ports: {
        [portHavenPrime]: {
          id: portHavenPrime,
          name: 'Haven Prime',
          description: 'A Guild hub at the crossroads of three shipping lanes. Survived the Silence intact and never stopped trading.',
          tags: ['tech', 'luxury'],
          faction: factionTraders,
          status: 'thriving',
          lastVisited: { cycle: 0 },
          marketModifiers: {
            [createId.cardDef('cargo_luxury_goods')]: 0.85,
            [createId.cardDef('cargo_processed_metals')]: 1.15,
            [createId.cardDef('cargo_raw_ore')]: 1.1,
          },
          availableCards: [
            createId.cardDef('cargo_raw_ore'),
            createId.cardDef('cargo_processed_metals'),
            createId.cardDef('cargo_medical_supplies'),
            createId.cardDef('cargo_luxury_goods'),
            createId.cardDef('cargo_salvage'),
            createId.cardDef('crew_navigator'),
            createId.cardDef('crew_engineer'),
            createId.cardDef('crew_medic'),
            createId.cardDef('crew_broker'),
            createId.cardDef('module_sensor_array'),
            createId.cardDef('module_expanded_hold'),
          ],
          availableContracts: [
            createId.cardDef('contract_standard_delivery'),
            createId.cardDef('contract_ore_shipment'),
          ],
          marketRefreshedAt: { cycle: 0 },
        },
        [createId.port('port_frontier_station')]: {
          id: createId.port('port_frontier_station'),
          name: 'Frontier Station 7',
          description: 'Edge of settled space. The colonists here need everything and have little to trade but raw materials and desperation.',
          tags: ['medicine', 'survival'],
          faction: createId.faction('faction_frontier_alliance'),
          status: 'declining',
          marketModifiers: {
            [createId.cardDef('cargo_medical_supplies')]: 2.2,
            [createId.cardDef('cargo_raw_ore')]: 0.6,
            [createId.cardDef('cargo_water_ice')]: 1.8,
            [createId.cardDef('cargo_salvage')]: 0.7,
          },
          availableCards: [
            createId.cardDef('cargo_raw_ore'),
            createId.cardDef('cargo_cryo_seeds'),
            createId.cardDef('cargo_salvage'),
            createId.cardDef('cargo_water_ice'),
            createId.cardDef('crew_stowaway'),
            createId.cardDef('crew_gunner'),
          ],
          availableContracts: [
            createId.cardDef('contract_medical_emergency'),
          ],
          marketRefreshedAt: { cycle: 0 },
        },
        [createId.port('port_shadow_market')]: {
          id: createId.port('port_shadow_market'),
          name: 'Shadow Market',
          description: 'It moves. No charts show it. If you need to find it, someone will find you first. Neutral ground for those who need to be invisible.',
          tags: ['contraband', 'ancient'],
          faction: null,
          status: 'stable',
          marketModifiers: {
            [createId.cardDef('cargo_contraband')]: 0.75,
            [createId.cardDef('cargo_ancient_artifacts')]: 1.4,
            [createId.cardDef('cargo_encrypted_data')]: 0.8,
            [createId.cardDef('cargo_volatile_isotopes')]: 0.85,
          },
          availableCards: [
            createId.cardDef('cargo_contraband'),
            createId.cardDef('cargo_volatile_isotopes'),
            createId.cardDef('cargo_memory_cores'),
            createId.cardDef('cargo_encrypted_data'),
            createId.cardDef('crew_ai_fragment'),
            createId.cardDef('module_point_defense'),
            createId.cardDef('module_smuggler_hold'),
          ],
          availableContracts: [
            createId.cardDef('contract_discrete_cargo'),
          ],
          marketRefreshedAt: { cycle: 0 },
        },
        [createId.port('port_industrial_complex')]: {
          id: createId.port('port_industrial_complex'),
          name: 'Crucible Station',
          description: 'The Consortium\'s crown jewel. Orbital forges that never cool, hungry for ore and paying premium for it.',
          tags: ['mineral', 'tech'],
          faction: createId.faction('faction_industrial_consortium'),
          status: 'thriving',
          marketModifiers: {
            [createId.cardDef('cargo_raw_ore')]: 1.6,
            [createId.cardDef('cargo_processed_metals')]: 0.75,
            [createId.cardDef('cargo_starship_components')]: 0.65,
            [createId.cardDef('cargo_volatile_isotopes')]: 1.3,
          },
          availableCards: [
            createId.cardDef('cargo_processed_metals'),
            createId.cardDef('cargo_starship_components'),
            createId.cardDef('cargo_volatile_isotopes'),
            createId.cardDef('crew_engineer'),
            createId.cardDef('crew_pilot'),
            createId.cardDef('module_reinforced_hull'),
            createId.cardDef('module_efficient_drives'),
          ],
          availableContracts: [
            createId.cardDef('contract_ore_shipment'),
          ],
          marketRefreshedAt: { cycle: 0 },
        },
        [createId.port('port_sanctuary')]: {
          id: createId.port('port_sanctuary'),
          name: 'The Sanctuary',
          description: 'Neutral ground. A hospital station that treats all comers, funded by old money and older guilt. No weapons allowed.',
          tags: ['medicine', 'cultural'],
          faction: null,
          status: 'stable',
          marketModifiers: {
            [createId.cardDef('cargo_medical_supplies')]: 0.85,
            [createId.cardDef('cargo_luxury_goods')]: 1.25,
            [createId.cardDef('cargo_cryo_seeds')]: 1.2,
          },
          availableCards: [
            createId.cardDef('cargo_medical_supplies'),
            createId.cardDef('cargo_luxury_goods'),
            createId.cardDef('cargo_cryo_seeds'),
            createId.cardDef('crew_medic'),
            createId.cardDef('crew_chaplain'),
            createId.cardDef('crew_quartermaster'),
            createId.cardDef('module_cryo_bay'),
          ],
          availableContracts: [
            createId.cardDef('contract_luxury_run'),
          ],
          marketRefreshedAt: { cycle: 0 },
        },
        [createId.port('port_research_station')]: {
          id: createId.port('port_research_station'),
          name: 'Axiom Observatory',
          description: 'The Science Collective\'s main facility. They study Prior artifacts and pay handsomely for specimens. What they learn, they don\'t share.',
          tags: ['data', 'ancient'],
          faction: createId.faction('faction_science_collective'),
          status: 'stable',
          marketModifiers: {
            [createId.cardDef('cargo_memory_cores')]: 1.5,
            [createId.cardDef('cargo_living_specimens')]: 1.9,
            [createId.cardDef('cargo_ancient_artifacts')]: 2.2,
            [createId.cardDef('cargo_encrypted_data')]: 1.3,
          },
          availableCards: [
            createId.cardDef('cargo_memory_cores'),
            createId.cardDef('cargo_encrypted_data'),
            createId.cardDef('crew_navigator'),
            createId.cardDef('crew_ai_fragment'),
            createId.cardDef('module_sensor_array'),
          ],
          availableContracts: [
            createId.cardDef('contract_artifact_retrieval'),
            createId.cardDef('contract_specimen_transport'),
          ],
          marketRefreshedAt: { cycle: 0 },
        },
        [createId.port('port_pirate_haven')]: {
          id: createId.port('port_pirate_haven'),
          name: 'Freeport Omega',
          description: 'No laws. No questions. No guarantees. A refuge for privateers, smugglers, and anyone who needs to disappear.',
          tags: ['contraband', 'weapon'],
          faction: null,
          status: 'declining',
          marketModifiers: {
            [createId.cardDef('cargo_contraband')]: 1.4,
            [createId.cardDef('cargo_volatile_isotopes')]: 0.75,
            [createId.cardDef('cargo_salvage')]: 1.3,
          },
          availableCards: [
            createId.cardDef('cargo_contraband'),
            createId.cardDef('cargo_volatile_isotopes'),
            createId.cardDef('cargo_salvage'),
            createId.cardDef('crew_gunner'),
            createId.cardDef('crew_stowaway'),
            createId.cardDef('crew_pilot'),
            createId.cardDef('module_point_defense'),
          ],
          availableContracts: [
            createId.cardDef('contract_pirate_bounty'),
            createId.cardDef('contract_discrete_cargo'),
          ],
          marketRefreshedAt: { cycle: 0 },
        },
      },
      factions: {
        [factionTraders]: {
          id: factionTraders,
          name: 'Free Traders Guild',
          reputation: 10,
          flags: {},
        },
        [createId.faction('faction_frontier_alliance')]: {
          id: createId.faction('faction_frontier_alliance'),
          name: 'Frontier Alliance',
          reputation: 0,
          flags: {},
        },
        [createId.faction('faction_industrial_consortium')]: {
          id: createId.faction('faction_industrial_consortium'),
          name: 'Industrial Consortium',
          reputation: 0,
          flags: {},
        },
        [createId.faction('faction_science_collective')]: {
          id: createId.faction('faction_science_collective'),
          name: 'Science Collective',
          reputation: 0,
          flags: {},
        },
      },
      knownPorts: [
        portHavenPrime,
        createId.port('port_frontier_station'),
        createId.port('port_industrial_complex'),
        createId.port('port_shadow_market'),
        createId.port('port_sanctuary'),
        createId.port('port_research_station'),
        createId.port('port_pirate_haven'),
      ],
      worldFlags: {},
    },
    
    chronicle: [
      {
        id: createId.chronicleEntry('genesis'),
        type: 'milestone',
        timestamp: { cycle: 0 },
        title: 'The Beginning',
        text: 'The Holdfast is yours now. The hold is empty. The void waits. Three centuries since the Silence, and still we haul cargo between the stars.',
        tags: ['start'],
      },
    ],
    
    achievements: {
      unlocked: [],
      unlockedAt: {},
    },
    
    flags: {},
    
    sceneletCooldowns: {},
    
    stats: {
      totalCreditsEarned: 0,
      totalDistanceTraveled: 0,
      portsVisited: 1,
      cardsAcquired: 0,
      crewLost: 0,
      contractsCompleted: 0,
      contractsFailed: 0,
    },
    
    rngSeed: Date.now(),
    rngState: Date.now(),
  };
}
