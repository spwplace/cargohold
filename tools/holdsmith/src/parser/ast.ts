/**
 * Holdsmith AST Types
 * 
 * Represents the parsed structure of .scene files.
 * These types are the intermediate representation between
 * raw text and compiled game Scenelet objects.
 */

// =============================================================================
// SOURCE LOCATION
// =============================================================================

/** Position in source file for error reporting */
export interface SourceLocation {
  readonly line: number;
  readonly column: number;
  readonly offset: number;
}

/** Span covering a range in source */
export interface SourceSpan {
  readonly start: SourceLocation;
  readonly end: SourceLocation;
  readonly source?: string | undefined;
}

// =============================================================================
// BASE NODE
// =============================================================================

/** Base interface for all AST nodes */
export interface ASTNode {
  readonly type: string;
  readonly span: SourceSpan;
}

// =============================================================================
// TOP-LEVEL SCENE
// =============================================================================

/** Root node representing an entire .scene file */
export interface SceneFile extends ASTNode {
  readonly type: 'SceneFile';
  readonly frontmatter: Frontmatter;
  readonly passages: Passage[];
}

/** YAML frontmatter metadata */
export interface Frontmatter extends ASTNode {
  readonly type: 'Frontmatter';
  readonly id: string;
  readonly title: string;
  readonly tags: string[];
  readonly context: 'journey' | 'port' | 'any';
  readonly weight: number;
  readonly cooldown: number;
  readonly requires?: Requirements | undefined;
}

/** Requirements for scene/choice to be available */
export interface Requirements extends ASTNode {
  readonly type: 'Requirements';
  readonly shipTags?: string[] | undefined;
  readonly crewTags?: string[] | undefined;
  readonly cargoTags?: string[] | undefined;
  readonly minResources?: ResourceCheck[] | undefined;
  readonly maxResources?: ResourceCheck[] | undefined;
  readonly requiredFlags?: string[] | undefined;
  readonly excludedFlags?: string[] | undefined;
  readonly factionRep?: FactionRepCheck | undefined;
}

export interface ResourceCheck {
  readonly resource: 'credits' | 'fuel' | 'supplies' | 'hull' | 'morale';
  readonly value: number;
}

export interface FactionRepCheck {
  readonly faction: string;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
}

// =============================================================================
// PASSAGES
// =============================================================================

/** A named passage/section within a scene */
export interface Passage extends ASTNode {
  readonly type: 'Passage';
  readonly name: string;
  readonly content: PassageContent[];
}

/** Content within a passage */
export type PassageContent = Prose | Choice;

/** Plain narrative text */
export interface Prose extends ASTNode {
  readonly type: 'Prose';
  readonly text: string;
}

// =============================================================================
// CHOICES
// =============================================================================

/** A player choice within a passage */
export interface Choice extends ASTNode {
  readonly type: 'Choice';
  readonly text: string;
  readonly condition?: Condition | undefined;
  readonly effects: Effect[];
  readonly target?: NavigationTarget | undefined;
}

/** Navigation target for a choice */
export interface NavigationTarget extends ASTNode {
  readonly type: 'NavigationTarget';
  readonly target: string;
  readonly isEnd: boolean;
}

// =============================================================================
// CONDITIONS
// =============================================================================

/** Condition for showing a choice */
export interface Condition extends ASTNode {
  readonly type: 'Condition';
  readonly clauses: ConditionClause[];
}

export type ConditionClause = 
  | TagCondition 
  | ResourceCondition 
  | FlagCondition;

/** Check for a tag on crew/ship/cargo */
export interface TagCondition extends ASTNode {
  readonly type: 'TagCondition';
  readonly source: 'crew' | 'ship' | 'cargo';
  readonly tag: string;
}

/** Check resource value */
export interface ResourceCondition extends ASTNode {
  readonly type: 'ResourceCondition';
  readonly resource: 'credits' | 'fuel' | 'supplies' | 'hull' | 'morale';
  readonly operator: '>=' | '<=' | '>' | '<' | '==' | '!=';
  readonly value: number;
}

/** Check flag value */
export interface FlagCondition extends ASTNode {
  readonly type: 'FlagCondition';
  readonly flag: string;
  readonly negated: boolean;
  readonly operator?: '>=' | '<=' | '>' | '<' | '==' | '!=' | undefined;
  readonly value?: number | string | boolean | undefined;
}

// =============================================================================
// EFFECTS
// =============================================================================

/** An effect that modifies game state */
export type Effect =
  | ResourceEffect
  | FlagEffect
  | AddCardEffect
  | RemoveCargoByTagEffect
  | ChronicleEffect
  | DamageEffect
  | ReputationEffect
  | DiscoverPortEffect;

/** Modify a resource */
export interface ResourceEffect extends ASTNode {
  readonly type: 'ResourceEffect';
  readonly resource: 'credits' | 'fuel' | 'supplies' | 'hull' | 'morale';
  readonly operator: '+=' | '-=' | '=';
  readonly value: number;
}

/** Set a flag */
export interface FlagEffect extends ASTNode {
  readonly type: 'FlagEffect';
  readonly flag: string;
  readonly value: boolean | number | string;
}

/** Add a card to player */
export interface AddCardEffect extends ASTNode {
  readonly type: 'AddCardEffect';
  readonly cardId: string;
}

/** Remove cargo by tag */
export interface RemoveCargoByTagEffect extends ASTNode {
  readonly type: 'RemoveCargoByTagEffect';
  readonly tag: string;
  readonly count: number;
}

/** Add a chronicle entry */
export interface ChronicleEffect extends ASTNode {
  readonly type: 'ChronicleEffect';
  readonly title: string;
  readonly text: string;
}

/** Apply damage */
export interface DamageEffect extends ASTNode {
  readonly type: 'DamageEffect';
  readonly target: 'hull' | 'morale';
  readonly value: number;
}

/** Modify faction reputation */
export interface ReputationEffect extends ASTNode {
  readonly type: 'ReputationEffect';
  readonly faction: string;
  readonly operator: '+=' | '-=';
  readonly value: number;
}

export interface DiscoverPortEffect extends ASTNode {
  readonly type: 'DiscoverPortEffect';
  readonly portId: string;
}

// =============================================================================
// UTILITIES
// =============================================================================

export function span(
  startLine: number, 
  startCol: number, 
  endLine: number, 
  endCol: number,
  source?: string
): SourceSpan {
  return {
    start: { line: startLine, column: startCol, offset: 0 },
    end: { line: endLine, column: endCol, offset: 0 },
    source,
  };
}

export function pointSpan(line: number, col: number, source?: string): SourceSpan {
  return span(line, col, line, col, source);
}

export function isNodeType<T extends ASTNode>(
  node: ASTNode, 
  type: T['type']
): node is T {
  return node.type === type;
}
