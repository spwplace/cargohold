/**
 * CARGO HOLD - Core Type Definitions
 * 
 * The fundamental types that define the game's state and mechanics.
 * Everything flows from these types.
 */

// =============================================================================
// IDENTIFIERS
// =============================================================================

/** Unique identifier for card definitions (static data) */
export type CardDefId = string & { readonly __brand: 'CardDefId' };

/** Unique identifier for card instances (player-owned) */
export type CardInstanceId = string & { readonly __brand: 'CardInstanceId' };

/** Unique identifier for ports/locations */
export type PortId = string & { readonly __brand: 'PortId' };

/** Unique identifier for factions */
export type FactionId = string & { readonly __brand: 'FactionId' };

/** Unique identifier for scenelets */
export type SceneletId = string & { readonly __brand: 'SceneletId' };

/** Unique identifier for chronicle entries */
export type ChronicleEntryId = string & { readonly __brand: 'ChronicleEntryId' };

function validateId(id: string, prefix: string): string {
  if (!id || typeof id !== 'string') {
    throw new Error(`Invalid ${prefix} ID: must be a non-empty string`);
  }
  const normalized = id.trim().toLowerCase().replace(/\s+/g, '_');
  if (normalized.length === 0) {
    throw new Error(`Invalid ${prefix} ID: cannot be empty after normalization`);
  }
  return normalized;
}

export const createId = {
  cardDef: (id: string): CardDefId => validateId(id, 'CardDef') as CardDefId,
  cardInstance: (id: string): CardInstanceId => validateId(id, 'CardInstance') as CardInstanceId,
  port: (id: string): PortId => validateId(id, 'Port') as PortId,
  faction: (id: string): FactionId => validateId(id, 'Faction') as FactionId,
  scenelet: (id: string): SceneletId => validateId(id, 'Scenelet') as SceneletId,
  chronicleEntry: (id: string): ChronicleEntryId => validateId(id, 'ChronicleEntry') as ChronicleEntryId,
};

// =============================================================================
// CARDS
// =============================================================================

export type CardType = 'cargo' | 'crew' | 'module' | 'contract' | 'echo';

export type CardRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

/** Tags for card categorization and event matching */
export type CardTag = 
  | 'organic' | 'mineral' | 'tech' | 'data' | 'contraband' | 'luxury' | 'medicine'
  | 'ancient' | 'volatile' | 'living' | 'frozen' | 'weapon' | 'cultural'
  | 'navigation' | 'engineering' | 'medical' | 'combat' | 'social' | 'survival'
  | 'sensor' | 'defense' | 'cargo' | 'life-support' | 'propulsion'
  | 'delivery' | 'smuggling' | 'rescue' | 'exploration' | 'diplomacy'
  | 'memory' | 'artifact' | 'lineage';

/** Static card definition - what a card IS */
export interface CardDef {
  readonly id: CardDefId;
  readonly type: CardType;
  readonly name: string;
  readonly description: string;
  readonly flavorText?: string;
  readonly rarity: CardRarity;
  readonly tags: readonly CardTag[];
  
  readonly effects: CardEffects;
  readonly journeyBehavior?: JourneyBehavior;
  
  readonly upgradesTo?: CardDefId;
  readonly upgradeCost?: ResourceBundle;
  
  readonly baseValue?: number;
  
  readonly contractTerms?: ContractTerms;
  readonly installRequirements?: InstallRequirements;
}

export interface CardEffects {
  readonly modifiers?: {
    readonly creditMultiplier?: number;
    readonly fuelEfficiency?: number;
    readonly cargoCapacity?: number;
    readonly journeySpeed?: number;
    readonly morale?: number;
    readonly hullIntegrity?: number;
  };
  
  readonly grantsShipTags?: readonly CardTag[];
  readonly unlocks?: readonly string[];
}

export interface JourneyBehavior {
  readonly decayChance?: number;
  readonly eventChance?: number;
  readonly eventPool?: readonly SceneletId[];
}

export interface ContractTerms {
  readonly destination: PortId;
  readonly cargoRequired?: { cardDefId: CardDefId; quantity: number };
  readonly cycleLimit: number;
  readonly reward: ResourceBundle;
  readonly penalty?: ResourceBundle;
  readonly reputationReward?: { faction: FactionId; amount: number };
}

export interface InstallRequirements {
  readonly minHull?: number;
  readonly requiredModules?: readonly CardDefId[];
  readonly excludesModules?: readonly CardDefId[];
  readonly slotType: 'sensor' | 'defense' | 'cargo' | 'propulsion' | 'utility';
}

/** A card instance - what the player actually owns */
export interface CardInstance {
  readonly instanceId: CardInstanceId;
  readonly cardDefId: CardDefId;
  readonly level: number;
  readonly condition: number;
  readonly mods: readonly CardMod[];
  readonly acquiredAt: GameTimestamp;
  
  readonly cyclesRemaining?: number | undefined;
  
  readonly customData?: Record<string, unknown> | undefined;
}

export interface CardMod {
  readonly type: string;
  readonly value: number;
  readonly source: string;
}

// =============================================================================
// RESOURCES
// =============================================================================

export interface Resources {
  credits: number;
  fuel: number;
  supplies: number;
  hull: number;
  morale: number;
}

export type ResourceBundle = Partial<Resources>;

// =============================================================================
// TIME (Abstract cycles - no real-time simulation)
// =============================================================================

/** Simple cycle counter for timestamps */
export interface GameTimestamp {
  readonly cycle: number;
}

export interface TimeState {
  /** Current cycle (increments on jumps and major events) */
  cycle: number;
  
  /** Total jumps completed */
  jumpsCompleted: number;
}

// =============================================================================
// SHIP
// =============================================================================

export interface ShipState {
  name: string;
  class: string;
  maxHull: number;
  
  /** Module slots and what's installed */
  modules: {
    readonly sensor: CardInstanceId | null;
    readonly defense: CardInstanceId | null;
    readonly cargo1: CardInstanceId | null;
    readonly cargo2: CardInstanceId | null;
    readonly propulsion: CardInstanceId | null;
    readonly utility1: CardInstanceId | null;
    readonly utility2: CardInstanceId | null;
  };
  
  /** Base cargo capacity (modified by modules) */
  baseCargoCapacity: number;
}

// =============================================================================
// WORLD
// =============================================================================

export interface PortState {
  readonly id: PortId;
  readonly name: string;
  readonly description: string;
  readonly tags: readonly CardTag[];
  readonly faction: FactionId | null;
  
  /** Current state - can change between visits */
  status: 'thriving' | 'stable' | 'declining' | 'ruined' | 'abandoned' | 'unknown';
  
  /** Last visited timestamp (if ever) */
  lastVisited?: GameTimestamp;
  
  /** Market prices - deviation from base */
  marketModifiers: Record<CardDefId, number>;
  
  /** Available cards to purchase */
  availableCards: CardDefId[];
  
  /** Available contracts */
  availableContracts: CardDefId[];
  
  /** When the market last refreshed */
  marketRefreshedAt: GameTimestamp;
}

export interface FactionState {
  readonly id: FactionId;
  readonly name: string;
  reputation: number; // -100 to 100
  
  /** Flags tracking faction-specific story progress */
  flags: Record<string, boolean | number | string>;
}

export interface WorldState {
  currentLocation: PortId;
  ports: Record<PortId, PortState>;
  factions: Record<FactionId, FactionState>;
  
  /** Discovered but not yet visited */
  knownPorts: PortId[];
  
  /** Global world flags */
  worldFlags: Record<string, boolean | number | string>;
}

// =============================================================================
// CARDS COLLECTION
// =============================================================================

export interface CardsState {
  /** All card instances owned by player */
  instances: Record<CardInstanceId, CardInstance>;
  
  /** Cards in the "collection" (not actively equipped) */
  collection: CardInstanceId[];
  
  /** Currently equipped/active cards */
  deck: CardInstanceId[];
  
  /** Crew roster (subset of deck that are crew type) */
  activeCrew: CardInstanceId[];
  
  /** Active contracts */
  activeContracts: CardInstanceId[];
}

// =============================================================================
// CHRONICLE (Narrative Log)
// =============================================================================

export type ChronicleEntryType = 
  | 'arrival' | 'departure' | 'trade' | 'acquisition' | 'loss'
  | 'crew_event' | 'encounter' | 'discovery' | 'contract' | 'death'
  | 'milestone' | 'game_over';

export interface ChronicleEntry {
  readonly id: ChronicleEntryId;
  readonly type: ChronicleEntryType;
  readonly timestamp: GameTimestamp;
  readonly title: string;
  readonly text: string;
  readonly tags: readonly string[];
  
  /** References to entities involved */
  readonly refs?: {
    readonly portId?: PortId;
    readonly cardIds?: readonly CardInstanceId[];
    readonly factionId?: FactionId;
  };
}

// =============================================================================
// GAME STATE (Top Level)
// =============================================================================

export interface GameState {
  readonly schemaVersion: number;
  
  time: TimeState;
  ship: ShipState;
  resources: Resources;
  cards: CardsState;
  world: WorldState;
  chronicle: ChronicleEntry[];
  achievements: AchievementState;
  
  flags: Record<string, boolean | number | string>;
  stats: GameStats;
  
  sceneletCooldowns: Record<SceneletId, number>;
  
  rngSeed: number;
  rngState: number;
}

export interface GameStats {
  totalCreditsEarned: number;
  totalDistanceTraveled: number;
  portsVisited: number;
  cardsAcquired: number;
  crewLost: number;
  contractsCompleted: number;
  contractsFailed: number;
}

export type AchievementId = string & { readonly __brand: 'AchievementId' };

export interface Achievement {
  readonly id: AchievementId;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly hidden?: boolean;
  readonly check: (state: GameState) => boolean;
}

export interface AchievementState {
  unlocked: AchievementId[];
  unlockedAt: Record<AchievementId, number>;
}

// =============================================================================
// ACTIONS (Player Input)
// =============================================================================

export type GameAction =
  | { type: 'TRAVEL'; payload: { destination: PortId } }
  | { type: 'TRADE_BUY'; payload: { cardDefId: CardDefId; quantity: number } }
  | { type: 'TRADE_SELL'; payload: { instanceId: CardInstanceId } }
  | { type: 'CARD_EQUIP'; payload: { instanceId: CardInstanceId } }
  | { type: 'CARD_UNEQUIP'; payload: { instanceId: CardInstanceId } }
  | { type: 'CARD_UPGRADE'; payload: { instanceId: CardInstanceId } }
  | { type: 'MODULE_INSTALL'; payload: { instanceId: CardInstanceId; slot: keyof ShipState['modules'] } }
  | { type: 'MODULE_UNINSTALL'; payload: { slot: keyof ShipState['modules'] } }
  | { type: 'CONTRACT_ACCEPT'; payload: { cardDefId: CardDefId } }
  | { type: 'CONTRACT_COMPLETE'; payload: { instanceId: CardInstanceId } }
  | { type: 'CONTRACT_ABANDON'; payload: { instanceId: CardInstanceId } }
  | { type: 'CREW_HIRE'; payload: { cardDefId: CardDefId } }
  | { type: 'CREW_DISMISS'; payload: { instanceId: CardInstanceId } }
  | { type: 'REPAIR'; payload: { amount: number } }
  | { type: 'RESUPPLY'; payload: { amount: number } }
  | { type: 'REFUEL'; payload: { amount: number } };

// =============================================================================
// EVENTS / SCENELETS
// =============================================================================

export interface Scenelet {
  readonly id: SceneletId;
  readonly title: string;
  readonly tags: readonly string[];
  
  /** Requirements to appear */
  readonly requirements: SceneletRequirements;
  
  /** Weight for random selection (higher = more likely) */
  readonly weight: number;
  
  /** Cooldown in game-years before can appear again */
  readonly cooldown: number;
  
  /** The narrative content */
  readonly passages: SceneletPassage[];
}

export interface SceneletRequirements {
  readonly context?: 'journey' | 'port' | 'any';
  
  readonly shipTags?: readonly CardTag[];
  readonly crewTags?: readonly CardTag[];
  readonly cargoTags?: readonly CardTag[];
  
  readonly minResources?: Partial<Resources>;
  readonly maxResources?: Partial<Resources>;
  
  readonly factionRep?: { faction: FactionId; min?: number; max?: number };
  
  readonly requiredFlags?: readonly string[];
  readonly excludedFlags?: readonly string[];
}

export interface SceneletPassage {
  readonly text: string;
  readonly choices?: SceneletChoice[];
}

export interface SceneletChoice {
  readonly text: string;
  readonly requirements?: Partial<SceneletRequirements>;
  readonly effects: SceneletEffects;
  readonly nextPassage?: number; // index into passages array
}

export interface SceneletEffects {
  readonly resources?: Partial<Resources>;
  readonly addCards?: readonly CardDefId[];
  readonly removeCards?: readonly CardInstanceId[];
  readonly removeCargoByTag?: { tag: string; count: number };
  readonly setFlags?: Record<string, boolean | number | string>;
  readonly addChronicle?: { title: string; text: string };
  readonly reputation?: { faction: FactionId; amount: number };
  readonly triggerScenelet?: SceneletId;
  
  /** Discover new ports (add to knownPorts) */
  readonly discoverPorts?: readonly PortId[];
  
  /** Damage to ship/crew */
  readonly damage?: { hull?: number; morale?: number; crewCasualties?: number };
}

// =============================================================================
// GAME CONFIG (Balance & Tuning)
// =============================================================================

export interface GameConfig {
  readonly baseFuelPerJump: number;
  readonly baseRepairCost: number;
  readonly baseSupplyCost: number;
  readonly baseFuelCost: number;
  
  readonly journeyEventCount: { min: number; max: number };
  readonly journeySupplyCost: number;
  readonly journeyHullWear: number;
  
  readonly contractTimeLimit: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  baseFuelPerJump: 10,
  baseRepairCost: 6,
  baseSupplyCost: 2,
  baseFuelCost: 3,
  
  journeyEventCount: { min: 1, max: 3 },
  journeySupplyCost: 2,
  journeyHullWear: 2,
  
  contractTimeLimit: 10,
};
