import type {
  SceneFile,
  Effect,
  ResourceEffect,
  Condition,
  Requirements,
} from '../parser/ast.js';

export type ResourceName = 'credits' | 'fuel' | 'supplies' | 'hull' | 'morale';
export type ResourceBundle = Partial<Record<ResourceName, number>>;

export interface RuntimeScenelet {
  readonly id: string;
  readonly title: string;
  readonly tags: readonly string[];
  readonly requirements: RuntimeRequirements;
  readonly weight: number;
  readonly cooldown: number;
  readonly passages: RuntimePassage[];
}

export interface RuntimeRequirements {
  readonly context?: 'journey' | 'port';
  readonly shipTags?: readonly string[];
  readonly crewTags?: readonly string[];
  readonly cargoTags?: readonly string[];
  readonly minResources?: ResourceBundle;
  readonly maxResources?: ResourceBundle;
  readonly requiredFlags?: readonly string[];
  readonly excludedFlags?: readonly string[];
}

export interface RuntimePassage {
  readonly text: string;
  readonly choices?: RuntimeChoice[];
}

export interface RuntimeChoice {
  readonly text: string;
  readonly requirements?: Partial<RuntimeRequirements>;
  readonly effects: RuntimeEffects;
  readonly nextPassage?: number;
}

export interface RuntimeEffects {
  readonly resources?: ResourceBundle;
  readonly addCards?: readonly string[];
  readonly setFlags?: Record<string, boolean | number | string>;
  readonly addChronicle?: { title: string; text: string };
  readonly damage?: { hull?: number; morale?: number };
  readonly reputation?: { faction: string; amount: number };
}

export interface TransformResult {
  readonly scenelet: RuntimeScenelet;
  readonly warnings: TransformWarning[];
}

export interface TransformWarning {
  readonly code: string;
  readonly message: string;
  readonly line?: number;
}

export function astToScenelet(scene: SceneFile): TransformResult {
  const warnings: TransformWarning[] = [];
  
  const passageNameToIndex = new Map<string, number>();
  scene.passages.forEach((p, i) => {
    passageNameToIndex.set(p.name, i);
  });
  
  const passages: RuntimePassage[] = scene.passages.map(astPassage => {
    let proseText = '';
    const choices: RuntimeChoice[] = [];
    
    for (const content of astPassage.content) {
      if (content.type === 'Prose') {
        proseText += (proseText ? '\n\n' : '') + content.text;
      } else if (content.type === 'Choice') {
        const effects = transformEffects(content.effects);
        
        let nextPassageIdx: number | undefined;
        if (content.target) {
          if (content.target.isEnd) {
            nextPassageIdx = undefined;
          } else {
            const idx = passageNameToIndex.get(content.target.target);
            if (idx !== undefined) {
              nextPassageIdx = idx;
            } else {
              warnings.push({
                code: 'UNKNOWN_PASSAGE',
                message: `Unknown passage: ${content.target.target}`,
                line: content.span.start.line,
              });
            }
          }
        }
        
        let requirements: Partial<RuntimeRequirements> | undefined;
        if (content.condition) {
          requirements = transformCondition(content.condition);
        }
        
        const choice: RuntimeChoice = {
          text: content.text,
          effects,
        };
        if (requirements) (choice as { requirements: Partial<RuntimeRequirements> }).requirements = requirements;
        if (nextPassageIdx !== undefined) (choice as { nextPassage: number }).nextPassage = nextPassageIdx;
        
        choices.push(choice);
      }
    }
    
    const runtimePassage: RuntimePassage = { text: proseText };
    if (choices.length > 0) (runtimePassage as { choices: RuntimeChoice[] }).choices = choices;
    return runtimePassage;
  });
  
  const requirements = transformRequirements(
    scene.frontmatter.context,
    scene.frontmatter.requires
  );
  
  return {
    scenelet: {
      id: scene.frontmatter.id,
      title: scene.frontmatter.title,
      tags: scene.frontmatter.tags,
      requirements,
      weight: scene.frontmatter.weight,
      cooldown: scene.frontmatter.cooldown,
      passages,
    },
    warnings,
  };
}

function transformRequirements(
  context: 'journey' | 'port' | 'any',
  requires?: Requirements
): RuntimeRequirements {
  const result: RuntimeRequirements = {};
  
  if (context !== 'any') {
    (result as { context: 'journey' | 'port' }).context = context;
  }
  
  if (!requires) return result;
  
  if (requires.shipTags && requires.shipTags.length > 0) {
    (result as { shipTags: string[] }).shipTags = requires.shipTags;
  }
  if (requires.crewTags && requires.crewTags.length > 0) {
    (result as { crewTags: string[] }).crewTags = requires.crewTags;
  }
  if (requires.cargoTags && requires.cargoTags.length > 0) {
    (result as { cargoTags: string[] }).cargoTags = requires.cargoTags;
  }
  if (requires.requiredFlags && requires.requiredFlags.length > 0) {
    (result as { requiredFlags: string[] }).requiredFlags = requires.requiredFlags;
  }
  if (requires.excludedFlags && requires.excludedFlags.length > 0) {
    (result as { excludedFlags: string[] }).excludedFlags = requires.excludedFlags;
  }
  
  if (requires.minResources && requires.minResources.length > 0) {
    const min: ResourceBundle = {};
    for (const check of requires.minResources) {
      min[check.resource] = check.value;
    }
    (result as { minResources: ResourceBundle }).minResources = min;
  }
  
  if (requires.maxResources && requires.maxResources.length > 0) {
    const max: ResourceBundle = {};
    for (const check of requires.maxResources) {
      max[check.resource] = check.value;
    }
    (result as { maxResources: ResourceBundle }).maxResources = max;
  }
  
  return result;
}

function transformCondition(condition: Condition): Partial<RuntimeRequirements> {
  const shipTags: string[] = [];
  const crewTags: string[] = [];
  const cargoTags: string[] = [];
  const requiredFlags: string[] = [];
  const excludedFlags: string[] = [];
  const minResources: ResourceBundle = {};
  const maxResources: ResourceBundle = {};
  
  for (const clause of condition.clauses) {
    switch (clause.type) {
      case 'TagCondition':
        if (clause.source === 'ship') shipTags.push(clause.tag);
        else if (clause.source === 'crew') crewTags.push(clause.tag);
        else if (clause.source === 'cargo') cargoTags.push(clause.tag);
        break;
        
      case 'FlagCondition':
        if (clause.negated) {
          excludedFlags.push(clause.flag);
        } else {
          requiredFlags.push(clause.flag);
        }
        break;
        
      case 'ResourceCondition':
        if (clause.operator === '>=' || clause.operator === '>') {
          minResources[clause.resource] = clause.value;
        } else if (clause.operator === '<=' || clause.operator === '<') {
          maxResources[clause.resource] = clause.value;
        }
        break;
    }
  }
  
  const result: Partial<RuntimeRequirements> = {};
  
  if (shipTags.length > 0) (result as { shipTags: string[] }).shipTags = shipTags;
  if (crewTags.length > 0) (result as { crewTags: string[] }).crewTags = crewTags;
  if (cargoTags.length > 0) (result as { cargoTags: string[] }).cargoTags = cargoTags;
  if (requiredFlags.length > 0) (result as { requiredFlags: string[] }).requiredFlags = requiredFlags;
  if (excludedFlags.length > 0) (result as { excludedFlags: string[] }).excludedFlags = excludedFlags;
  if (Object.keys(minResources).length > 0) (result as { minResources: ResourceBundle }).minResources = minResources;
  if (Object.keys(maxResources).length > 0) (result as { maxResources: ResourceBundle }).maxResources = maxResources;
  
  return result;
}

function transformEffects(effects: Effect[]): RuntimeEffects {
  const result: RuntimeEffects = {};
  
  const resources: ResourceBundle = {};
  const addCards: string[] = [];
  const setFlags: Record<string, boolean | number | string> = {};
  let damage: { hull?: number; morale?: number } | undefined;
  
  for (const effect of effects) {
    switch (effect.type) {
      case 'ResourceEffect':
        applyResourceEffect(effect, resources);
        break;
        
      case 'FlagEffect':
        setFlags[effect.flag] = effect.value;
        break;
        
      case 'AddCardEffect':
        addCards.push(effect.cardId);
        break;
        
      case 'ChronicleEffect':
        (result as { addChronicle: { title: string; text: string } }).addChronicle = {
          title: effect.title,
          text: effect.text,
        };
        break;
        
      case 'DamageEffect':
        if (!damage) damage = {};
        damage[effect.target] = effect.value;
        break;
        
      case 'ReputationEffect':
        (result as { reputation: { faction: string; amount: number } }).reputation = {
          faction: effect.faction,
          amount: effect.operator === '-=' ? -effect.value : effect.value,
        };
        break;
    }
  }
  
  if (Object.keys(resources).length > 0) {
    (result as { resources: ResourceBundle }).resources = resources;
  }
  if (addCards.length > 0) {
    (result as { addCards: string[] }).addCards = addCards;
  }
  if (Object.keys(setFlags).length > 0) {
    (result as { setFlags: Record<string, boolean | number | string> }).setFlags = setFlags;
  }
  if (damage) {
    (result as { damage: { hull?: number; morale?: number } }).damage = damage;
  }
  
  return result;
}

function applyResourceEffect(
  effect: ResourceEffect, 
  resources: ResourceBundle
): void {
  const current = resources[effect.resource] ?? 0;
  
  switch (effect.operator) {
    case '+=':
      resources[effect.resource] = current + effect.value;
      break;
    case '-=':
      resources[effect.resource] = current - effect.value;
      break;
    case '=':
      resources[effect.resource] = effect.value;
      break;
  }
}
