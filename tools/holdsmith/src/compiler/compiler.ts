import type {
  SceneFile,
  Effect,
  ResourceEffect,
  Condition,
  Requirements,
} from '../parser/ast.js';

export interface CompiledScenelet {
  readonly id: string;
  readonly title: string;
  readonly tags: readonly string[];
  readonly requirements: CompiledRequirements;
  readonly weight: number;
  readonly cooldown: number;
  readonly passages: CompiledPassage[];
}

export interface CompiledRequirements {
  readonly context?: 'journey' | 'port' | 'any' | undefined;
  readonly shipTags?: readonly string[] | undefined;
  readonly crewTags?: readonly string[] | undefined;
  readonly cargoTags?: readonly string[] | undefined;
  readonly minResources?: Partial<CompiledResources> | undefined;
  readonly maxResources?: Partial<CompiledResources> | undefined;
  readonly requiredFlags?: readonly string[] | undefined;
  readonly excludedFlags?: readonly string[] | undefined;
}

export interface CompiledResources {
  credits: number;
  fuel: number;
  supplies: number;
  hull: number;
  morale: number;
}

export interface CompiledPassage {
  readonly text: string;
  readonly choices?: CompiledChoice[] | undefined;
}

export interface CompiledChoice {
  readonly text: string;
  readonly requirements?: Partial<CompiledRequirements> | undefined;
  readonly effects: CompiledEffects;
  readonly nextPassage?: number | undefined;
}

export interface CompiledEffects {
  readonly resources?: Partial<CompiledResources> | undefined;
  readonly addCards?: readonly string[] | undefined;
  readonly removeCargoByTag?: { tag: string; count: number } | undefined;
  readonly setFlags?: Record<string, boolean | number | string> | undefined;
  readonly addChronicle?: { title: string; text: string } | undefined;
  readonly damage?: { hull?: number; morale?: number } | undefined;
  readonly reputation?: { faction: string; amount: number } | undefined;
}

export interface CompileResult {
  readonly scenelet: CompiledScenelet;
  readonly warnings: CompileWarning[];
}

export interface CompileWarning {
  readonly code: string;
  readonly message: string;
  readonly line?: number | undefined;
}

export function compile(scene: SceneFile): CompileResult {
  const warnings: CompileWarning[] = [];
  
  const passageNameToIndex = new Map<string, number>();
  scene.passages.forEach((p, i) => {
    passageNameToIndex.set(p.name, i);
  });
  
  const compiledPassages: CompiledPassage[] = scene.passages.map(passage => {
    let proseText = '';
    const choices: CompiledChoice[] = [];
    
    for (const content of passage.content) {
      if (content.type === 'Prose') {
        proseText += (proseText ? '\n\n' : '') + content.text;
      } else if (content.type === 'Choice') {
        const compiledEffects = compileEffects(content.effects);
        
        let nextPassage: number | undefined;
        if (content.target) {
          if (content.target.isEnd) {
            nextPassage = undefined;
          } else {
            const idx = passageNameToIndex.get(content.target.target);
            if (idx !== undefined) {
              nextPassage = idx;
            } else {
              warnings.push({
                code: 'UNKNOWN_PASSAGE',
                message: `Unknown passage: ${content.target.target}`,
                line: content.span.start.line,
              });
            }
          }
        }
        
        let requirements: Partial<CompiledRequirements> | undefined;
        if (content.condition) {
          requirements = compileCondition(content.condition);
        }
        
        choices.push({
          text: content.text,
          requirements,
          effects: compiledEffects,
          nextPassage,
        });
      }
    }
    
    return {
      text: proseText,
      choices: choices.length > 0 ? choices : undefined,
    };
  });
  
  const compiledRequirements = compileRequirements(
    scene.frontmatter.context,
    scene.frontmatter.requires
  );
  
  return {
    scenelet: {
      id: scene.frontmatter.id,
      title: scene.frontmatter.title,
      tags: scene.frontmatter.tags,
      requirements: compiledRequirements,
      weight: scene.frontmatter.weight,
      cooldown: scene.frontmatter.cooldown,
      passages: compiledPassages,
    },
    warnings,
  };
}

function compileRequirements(
  context: 'journey' | 'port' | 'any',
  requires?: Requirements
): CompiledRequirements {
  const result: CompiledRequirements = {
    context: context !== 'any' ? context : undefined,
  };
  
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
    const min: Partial<CompiledResources> = {};
    for (const check of requires.minResources) {
      min[check.resource] = check.value;
    }
    (result as { minResources: Partial<CompiledResources> }).minResources = min;
  }
  
  if (requires.maxResources && requires.maxResources.length > 0) {
    const max: Partial<CompiledResources> = {};
    for (const check of requires.maxResources) {
      max[check.resource] = check.value;
    }
    (result as { maxResources: Partial<CompiledResources> }).maxResources = max;
  }
  
  return result;
}

function compileCondition(condition: Condition): Partial<CompiledRequirements> {
  const shipTags: string[] = [];
  const crewTags: string[] = [];
  const cargoTags: string[] = [];
  const requiredFlags: string[] = [];
  const excludedFlags: string[] = [];
  const minResources: Partial<CompiledResources> = {};
  const maxResources: Partial<CompiledResources> = {};
  
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
  
  const result: Partial<CompiledRequirements> = {};
  
  if (shipTags.length > 0) (result as { shipTags: string[] }).shipTags = shipTags;
  if (crewTags.length > 0) (result as { crewTags: string[] }).crewTags = crewTags;
  if (cargoTags.length > 0) (result as { cargoTags: string[] }).cargoTags = cargoTags;
  if (requiredFlags.length > 0) (result as { requiredFlags: string[] }).requiredFlags = requiredFlags;
  if (excludedFlags.length > 0) (result as { excludedFlags: string[] }).excludedFlags = excludedFlags;
  if (Object.keys(minResources).length > 0) (result as { minResources: Partial<CompiledResources> }).minResources = minResources;
  if (Object.keys(maxResources).length > 0) (result as { maxResources: Partial<CompiledResources> }).maxResources = maxResources;
  
  return result;
}

function compileEffects(effects: Effect[]): CompiledEffects {
  const result: CompiledEffects = {};
  
  const resources: Partial<CompiledResources> = {};
  const addCards: string[] = [];
  const setFlags: Record<string, boolean | number | string> = {};
  const discoverPorts: string[] = [];
  let damage: { hull?: number; morale?: number } | undefined;
  let removeCargoByTag: { tag: string; count: number } | undefined;
  
  for (const effect of effects) {
    switch (effect.type) {
      case 'ResourceEffect':
        compileResourceEffect(effect, resources);
        break;
        
      case 'FlagEffect':
        setFlags[effect.flag] = effect.value;
        break;
        
      case 'AddCardEffect':
        addCards.push(effect.cardId);
        break;
        
      case 'RemoveCargoByTagEffect':
        removeCargoByTag = { tag: effect.tag, count: effect.count };
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
        
      case 'DiscoverPortEffect':
        discoverPorts.push(effect.portId);
        break;
    }
  }
  
  if (Object.keys(resources).length > 0) {
    (result as { resources: Partial<CompiledResources> }).resources = resources;
  }
  if (addCards.length > 0) {
    (result as { addCards: string[] }).addCards = addCards;
  }
  if (removeCargoByTag) {
    (result as { removeCargoByTag: { tag: string; count: number } }).removeCargoByTag = removeCargoByTag;
  }
  if (Object.keys(setFlags).length > 0) {
    (result as { setFlags: Record<string, boolean | number | string> }).setFlags = setFlags;
  }
  if (discoverPorts.length > 0) {
    (result as { discoverPorts: string[] }).discoverPorts = discoverPorts;
  }
  if (damage) {
    (result as { damage: { hull?: number; morale?: number } }).damage = damage;
  }
  
  return result;
}

function compileResourceEffect(
  effect: ResourceEffect, 
  resources: Partial<CompiledResources>
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

export function emitTypeScript(scenelet: CompiledScenelet, importPath: string = '../../../core/types.js'): string {
  const lines: string[] = [];
  
  const hasCards = hasAddCards(scenelet);
  const hasPorts = hasDiscoverPorts(scenelet);
  
  const typesList = ['Scenelet', 'SceneletId'];
  if (hasCards) typesList.push('CardDefId');
  if (hasPorts) typesList.push('PortId');
  
  lines.push(`import type { ${typesList.join(', ')} } from '${importPath}';`);
  lines.push('');
  lines.push('const id = (s: string): SceneletId => s as SceneletId;');
  if (hasCards) {
    lines.push('const cardId = (s: string): CardDefId => s as CardDefId;');
  }
  if (hasPorts) {
    lines.push('const portId = (s: string): PortId => s as PortId;');
  }
  lines.push('');
  lines.push(`export const ${sanitizeIdentifier(scenelet.id)}: Scenelet = ${jsonToTypeScript(scenelet, 0, {})};`);
  
  return lines.join('\n');
}

function hasAddCards(obj: unknown): boolean {
  if (obj === null || obj === undefined) return false;
  if (typeof obj !== 'object') return false;
  
  if (Array.isArray(obj)) {
    return obj.some(item => hasAddCards(item));
  }
  
  const record = obj as Record<string, unknown>;
  if ('addCards' in record && Array.isArray(record.addCards) && record.addCards.length > 0) {
    return true;
  }
  
  return Object.values(record).some(value => hasAddCards(value));
}

function hasDiscoverPorts(obj: unknown): boolean {
  if (obj === null || obj === undefined) return false;
  if (typeof obj !== 'object') return false;
  
  if (Array.isArray(obj)) {
    return obj.some(item => hasDiscoverPorts(item));
  }
  
  const record = obj as Record<string, unknown>;
  if ('discoverPorts' in record && Array.isArray(record.discoverPorts) && record.discoverPorts.length > 0) {
    return true;
  }
  
  return Object.values(record).some(value => hasDiscoverPorts(value));
}

function sanitizeIdentifier(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

interface JsonContext {
  inIdField?: boolean;
  inAddCards?: boolean;
  inDiscoverPorts?: boolean;
}

function jsonToTypeScript(obj: unknown, indent: number = 0, ctx: JsonContext = {}): string {
  const pad = '  '.repeat(indent);
  const padInner = '  '.repeat(indent + 1);
  
  if (obj === null || obj === undefined) {
    return 'undefined';
  }
  
  if (typeof obj === 'string') {
    if (ctx.inIdField) {
      return `id(${JSON.stringify(obj)})`;
    }
    if (ctx.inAddCards) {
      return `cardId(${JSON.stringify(obj)})`;
    }
    if (ctx.inDiscoverPorts) {
      return `portId(${JSON.stringify(obj)})`;
    }
    if (obj.includes('\n')) {
      return '`' + obj.replace(/`/g, '\\`').replace(/\$/g, '\\$') + '`';
    }
    return JSON.stringify(obj);
  }
  
  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return String(obj);
  }
  
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    if (ctx.inAddCards && obj.every(item => typeof item === 'string')) {
      return '[' + obj.map(s => `cardId(${JSON.stringify(s)})`).join(', ') + ']';
    }
    if (ctx.inDiscoverPorts && obj.every(item => typeof item === 'string')) {
      return '[' + obj.map(s => `portId(${JSON.stringify(s)})`).join(', ') + ']';
    }
    if (obj.every(item => typeof item === 'string')) {
      return '[' + obj.map(s => JSON.stringify(s)).join(', ') + ']';
    }
    const items = obj.map(item => jsonToTypeScript(item, indent + 1, ctx));
    return '[\n' + padInner + items.join(',\n' + padInner) + ',\n' + pad + ']';
  }
  
  if (typeof obj === 'object') {
    const entries = Object.entries(obj).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '{}';
    
    const props = entries.map(([key, value]) => {
      const safeKey = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key) ? key : JSON.stringify(key);
      const newCtx: JsonContext = {};
      if (key === 'id' && typeof value === 'string') {
        newCtx.inIdField = true;
      }
      if (key === 'addCards') {
        newCtx.inAddCards = true;
      }
      if (key === 'discoverPorts') {
        newCtx.inDiscoverPorts = true;
      }
      return `${safeKey}: ${jsonToTypeScript(value, indent + 1, newCtx)}`;
    });
    
    return '{\n' + padInner + props.join(',\n' + padInner) + ',\n' + pad + '}';
  }
  
  return String(obj);
}
