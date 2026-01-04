import { parse as parseYaml } from 'yaml';
import type { Token, TokenType } from './lexer.js';
import { lex } from './lexer.js';
import type {
  SceneFile,
  Frontmatter,
  Passage,
  PassageContent,
  Choice,
  Prose,
  Effect,
  ResourceEffect,
  FlagEffect,
  AddCardEffect,
  RemoveCargoByTagEffect,
  ChronicleEffect,
  DamageEffect,
  ReputationEffect,
  DiscoverPortEffect,
  Condition,
  ConditionClause,
  TagCondition,
  ResourceCondition,
  FlagCondition,
  NavigationTarget,
  Requirements,
  SourceSpan,
  ResourceCheck,
} from './ast.js';
import { ParseError, ParseErrorCode } from './errors.js';

type ResourceName = 'credits' | 'fuel' | 'supplies' | 'hull' | 'morale';
type ComparisonOp = '>=' | '<=' | '>' | '<' | '==' | '!=';

const RESOURCES = new Set<ResourceName>(['credits', 'fuel', 'supplies', 'hull', 'morale']);

function isResource(s: string): s is ResourceName {
  return RESOURCES.has(s as ResourceName);
}

interface ParserState {
  tokens: Token[];
  pos: number;
  filename: string;
}

function createParser(tokens: Token[], filename: string): ParserState {
  return { tokens, pos: 0, filename };
}

function current(state: ParserState): Token {
  return state.tokens[state.pos] ?? state.tokens[state.tokens.length - 1]!;
}

function isAtEnd(state: ParserState): boolean {
  return current(state).type === 'EOF';
}

function check(state: ParserState, type: TokenType): boolean {
  return current(state).type === type;
}

function advance(state: ParserState): Token {
  if (!isAtEnd(state)) state.pos++;
  return state.tokens[state.pos - 1]!;
}

function consume(state: ParserState, type: TokenType, message: string): Token {
  if (check(state, type)) return advance(state);
  throw new ParseError(
    ParseErrorCode.UNEXPECTED_TOKEN,
    message,
    current(state).span
  );
}

function match(state: ParserState, ...types: TokenType[]): boolean {
  for (const type of types) {
    if (check(state, type)) {
      advance(state);
      return true;
    }
  }
  return false;
}

function skipNewlines(state: ParserState): void {
  while (match(state, 'NEWLINE')) { }
}

function spanFrom(start: Token, end: Token, filename: string): SourceSpan {
  return {
    start: start.span.start,
    end: end.span.end,
    source: filename,
  };
}

function parseFrontmatter(state: ParserState): Frontmatter {
  const startToken = consume(state, 'FRONTMATTER_DELIM', 'Expected frontmatter start ---');
  skipNewlines(state);
  
  let yamlContent = '';
  while (!check(state, 'FRONTMATTER_DELIM') && !isAtEnd(state)) {
    const token = advance(state);
    if (token.type === 'TEXT') {
      yamlContent += token.value + '\n';
    }
  }
  
  const endToken = consume(state, 'FRONTMATTER_DELIM', 'Expected frontmatter end ---');
  skipNewlines(state);
  
  let data: Record<string, unknown>;
  try {
    data = parseYaml(yamlContent) as Record<string, unknown>;
  } catch {
    throw new ParseError(
      ParseErrorCode.INVALID_FRONTMATTER,
      'Invalid YAML in frontmatter',
      startToken.span
    );
  }
  
  const id = typeof data['id'] === 'string' ? data['id'] : '';
  const title = typeof data['title'] === 'string' ? data['title'] : '';
  const rawTags = data['tags'];
  const tags: string[] = Array.isArray(rawTags) ? rawTags.filter((t): t is string => typeof t === 'string') : [];
  const rawContext = data['context'];
  const context = (rawContext === 'journey' || rawContext === 'port' || rawContext === 'any') 
    ? rawContext 
    : 'any';
  const weight = typeof data['weight'] === 'number' ? data['weight'] : 10;
  const cooldown = typeof data['cooldown'] === 'number' ? data['cooldown'] : 5;
  
  let requires: Requirements | undefined;
  if (data['requires'] && typeof data['requires'] === 'object') {
    requires = parseRequirementsFromYaml(data['requires'] as Record<string, unknown>, startToken);
  }
  
  return {
    type: 'Frontmatter',
    id,
    title,
    tags,
    context,
    weight,
    cooldown,
    requires,
    span: spanFrom(startToken, endToken, state.filename),
  };
}

function parseRequirementsFromYaml(
  data: Record<string, unknown>, 
  token: Token
): Requirements {
  const shipTags = parseStringArray(data['shipTags']);
  const crewTags = parseStringArray(data['crewTags']);
  const cargoTags = parseStringArray(data['cargoTags']);
  const requiredFlags = parseStringArray(data['requiredFlags']);
  const excludedFlags = parseStringArray(data['excludedFlags']);
  
  let minResources: ResourceCheck[] | undefined;
  let maxResources: ResourceCheck[] | undefined;
  
  if (data['minResources'] && typeof data['minResources'] === 'object') {
    minResources = parseResourceChecks(data['minResources'] as Record<string, unknown>);
  }
  if (data['maxResources'] && typeof data['maxResources'] === 'object') {
    maxResources = parseResourceChecks(data['maxResources'] as Record<string, unknown>);
  }
  
  return {
    type: 'Requirements',
    shipTags: shipTags.length > 0 ? shipTags : undefined,
    crewTags: crewTags.length > 0 ? crewTags : undefined,
    cargoTags: cargoTags.length > 0 ? cargoTags : undefined,
    minResources: minResources && minResources.length > 0 ? minResources : undefined,
    maxResources: maxResources && maxResources.length > 0 ? maxResources : undefined,
    requiredFlags: requiredFlags.length > 0 ? requiredFlags : undefined,
    excludedFlags: excludedFlags.length > 0 ? excludedFlags : undefined,
    span: token.span,
  };
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function parseResourceChecks(data: Record<string, unknown>): ResourceCheck[] {
  const checks: ResourceCheck[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (isResource(key) && typeof value === 'number') {
      checks.push({ resource: key, value });
    }
  }
  return checks;
}

function parsePassage(state: ParserState): Passage {
  const headerToken = consume(state, 'PASSAGE_HEADER', 'Expected passage header ===');
  const name = headerToken.value;
  skipNewlines(state);
  
  const content: PassageContent[] = [];
  let proseLines: string[] = [];
  let proseStart: Token | undefined;
  
  const flushProse = () => {
    if (proseLines.length > 0 && proseStart) {
      const text = proseLines.join('\n').trim();
      if (text) {
        content.push({
          type: 'Prose',
          text,
          span: proseStart.span,
        } satisfies Prose);
      }
      proseLines = [];
      proseStart = undefined;
    }
  };
  
  while (!isAtEnd(state) && !check(state, 'PASSAGE_HEADER')) {
    skipNewlines(state);
    
    if (isAtEnd(state) || check(state, 'PASSAGE_HEADER')) break;
    
    if (check(state, 'CHOICE_MARKER')) {
      flushProse();
      content.push(parseChoice(state));
    } else if (check(state, 'TEXT') || check(state, 'IDENTIFIER')) {
      if (!proseStart) proseStart = current(state);
      proseLines.push(advance(state).value);
    } else if (check(state, 'NEWLINE')) {
      advance(state);
    } else {
      break;
    }
  }
  
  flushProse();
  
  return {
    type: 'Passage',
    name,
    content,
    span: spanFrom(headerToken, current(state), state.filename),
  };
}

function parseChoice(state: ParserState): Choice {
  const startToken = consume(state, 'CHOICE_MARKER', 'Expected * for choice');
  skipWhitespace(state);
  
  consume(state, 'LBRACKET', 'Expected [ after *');
  
  const textParts: string[] = [];
  while (!check(state, 'RBRACKET') && !isAtEnd(state)) {
    textParts.push(advance(state).value);
    if (check(state, 'NEWLINE')) break;
  }
  const text = textParts.join(' ');
  consume(state, 'RBRACKET', 'Expected ] to close choice text');
  
  let condition: Condition | undefined;
  skipWhitespace(state);
  if (check(state, 'LBRACE')) {
    condition = parseCondition(state);
  }
  
  skipNewlines(state);
  
  const effects: Effect[] = [];
  let target: NavigationTarget | undefined;
  
  if (check(state, 'INDENT')) {
    advance(state);
    
    while (!check(state, 'DEDENT') && !isAtEnd(state)) {
      skipNewlines(state);
      if (check(state, 'DEDENT') || isAtEnd(state)) break;
      
      if (check(state, 'EFFECT_MARKER')) {
        effects.push(parseEffect(state));
      } else if (check(state, 'ARROW')) {
        target = parseNavigation(state);
      } else if (check(state, 'NEWLINE')) {
        advance(state);
      } else {
        break;
      }
    }
    
    if (check(state, 'DEDENT')) advance(state);
  }
  
  if (!target && check(state, 'ARROW')) {
    target = parseNavigation(state);
  }
  
  return {
    type: 'Choice',
    text: text.trim(),
    condition,
    effects,
    target,
    span: spanFrom(startToken, current(state), state.filename),
  };
}

function skipWhitespace(state: ParserState): void {
  while (check(state, 'NEWLINE')) {
    advance(state);
  }
}

function parseCondition(state: ParserState): Condition {
  const startToken = consume(state, 'LBRACE', 'Expected {');
  const clauses: ConditionClause[] = [];
  
  while (!check(state, 'RBRACE') && !isAtEnd(state)) {
    clauses.push(parseConditionClause(state));
    
    if (check(state, 'COMMA')) {
      advance(state);
    } else {
      break;
    }
  }
  
  const endToken = consume(state, 'RBRACE', 'Expected }');
  
  return {
    type: 'Condition',
    clauses,
    span: spanFrom(startToken, endToken, state.filename),
  };
}

function parseConditionClause(state: ParserState): ConditionClause {
  const startToken = current(state);
  
  const negated = check(state, 'BANG');
  if (negated) advance(state);
  
  if (check(state, 'IDENTIFIER')) {
    const first = advance(state);
    
    if (check(state, 'DOT')) {
      advance(state);
      const tag = consume(state, 'IDENTIFIER', 'Expected tag name after .').value;
      
      const source = first.value as 'crew' | 'ship' | 'cargo';
      if (source !== 'crew' && source !== 'ship' && source !== 'cargo') {
        throw new ParseError(
          ParseErrorCode.INVALID_CONDITION,
          `Invalid source for tag: ${first.value}. Expected crew, ship, or cargo`,
          first.span
        );
      }
      
      return {
        type: 'TagCondition',
        source,
        tag,
        span: spanFrom(startToken, current(state), state.filename),
      } satisfies TagCondition;
    }
    
    if (first.value === 'flag') {
      const flagName = consume(state, 'IDENTIFIER', 'Expected flag name').value;
      
      let operator: ComparisonOp | undefined;
      let value: number | string | boolean | undefined;
      
      if (check(state, 'COMPARISON')) {
        operator = advance(state).value as ComparisonOp;
        if (check(state, 'NUMBER')) {
          value = parseFloat(advance(state).value);
        } else if (check(state, 'STRING')) {
          value = advance(state).value;
        }
      }
      
      return {
        type: 'FlagCondition',
        flag: flagName,
        negated,
        operator,
        value,
        span: spanFrom(startToken, current(state), state.filename),
      } satisfies FlagCondition;
    }
    
    if (isResource(first.value)) {
      const operator = consume(state, 'COMPARISON', 'Expected comparison operator').value as ComparisonOp;
      const value = parseFloat(consume(state, 'NUMBER', 'Expected number').value);
      
      return {
        type: 'ResourceCondition',
        resource: first.value,
        operator,
        value,
        span: spanFrom(startToken, current(state), state.filename),
      } satisfies ResourceCondition;
    }
    
    return {
      type: 'FlagCondition',
      flag: first.value,
      negated,
      span: spanFrom(startToken, current(state), state.filename),
    } satisfies FlagCondition;
  }
  
  throw new ParseError(
    ParseErrorCode.INVALID_CONDITION,
    'Invalid condition',
    current(state).span
  );
}

function parseEffect(state: ParserState): Effect {
  const startToken = consume(state, 'EFFECT_MARKER', 'Expected ~ for effect');
  
  const keyword = consume(state, 'IDENTIFIER', 'Expected effect keyword').value;
  
  if (isResource(keyword)) {
    let operator: '+=' | '-=' | '=';
    
    if (check(state, 'PLUS_EQUALS')) {
      advance(state);
      operator = '+=';
    } else if (check(state, 'MINUS_EQUALS')) {
      advance(state);
      operator = '-=';
    } else if (check(state, 'EQUALS')) {
      advance(state);
      operator = '=';
    } else {
      throw new ParseError(
        ParseErrorCode.INVALID_EFFECT,
        'Expected +=, -=, or = after resource',
        current(state).span
      );
    }
    
    const valueToken = consume(state, 'NUMBER', 'Expected number value');
    const value = parseFloat(valueToken.value);
    
    skipNewlines(state);
    
    return {
      type: 'ResourceEffect',
      resource: keyword,
      operator,
      value,
      span: spanFrom(startToken, valueToken, state.filename),
    } satisfies ResourceEffect;
  }
  
  if (keyword === 'flag') {
    const flagName = consume(state, 'IDENTIFIER', 'Expected flag name').value;
    let value: boolean | number | string = true;
    
    if (check(state, 'EQUALS')) {
      advance(state);
      if (check(state, 'NUMBER')) {
        value = parseFloat(advance(state).value);
      } else if (check(state, 'STRING')) {
        value = advance(state).value;
      } else if (check(state, 'IDENTIFIER')) {
        const v = advance(state).value;
        value = v === 'true' ? true : v === 'false' ? false : v;
      }
    }
    
    skipNewlines(state);
    
    return {
      type: 'FlagEffect',
      flag: flagName,
      value,
      span: spanFrom(startToken, current(state), state.filename),
    } satisfies FlagEffect;
  }
  
  if (keyword === 'addCard') {
    const cardId = consume(state, 'IDENTIFIER', 'Expected card ID').value;
    skipNewlines(state);
    
    return {
      type: 'AddCardEffect',
      cardId,
      span: spanFrom(startToken, current(state), state.filename),
    } satisfies AddCardEffect;
  }
  
  if (keyword === 'chronicle') {
    const title = consume(state, 'STRING', 'Expected chronicle title in quotes').value;
    skipNewlines(state);
    
    let text = '';
    if (check(state, 'INDENT')) {
      advance(state);
      while (!check(state, 'DEDENT') && !isAtEnd(state)) {
        if (check(state, 'TEXT') || check(state, 'IDENTIFIER') || check(state, 'NUMBER')) {
          const value = advance(state).value;
          if (text && !value.startsWith("'")) {
            text += ' ';
          }
          text += value;
        } else if (check(state, 'DOT') || check(state, 'COMMA') || check(state, 'COLON')) {
          text += advance(state).value;
        } else if (check(state, 'NEWLINE')) {
          advance(state);
        } else {
          break;
        }
      }
      if (check(state, 'DEDENT')) advance(state);
    }
    
    return {
      type: 'ChronicleEffect',
      title,
      text: text.trim(),
      span: spanFrom(startToken, current(state), state.filename),
    } satisfies ChronicleEffect;
  }
  
  if (keyword === 'damage') {
    const targetStr = consume(state, 'IDENTIFIER', 'Expected damage target (hull or morale)').value;
    if (targetStr !== 'hull' && targetStr !== 'morale') {
      throw new ParseError(
        ParseErrorCode.INVALID_EFFECT,
        'Damage target must be hull or morale',
        current(state).span
      );
    }
    const value = parseFloat(consume(state, 'NUMBER', 'Expected damage value').value);
    skipNewlines(state);
    
    return {
      type: 'DamageEffect',
      target: targetStr,
      value,
      span: spanFrom(startToken, current(state), state.filename),
    } satisfies DamageEffect;
  }
  
  if (keyword === 'reputation') {
    const faction = consume(state, 'IDENTIFIER', 'Expected faction name').value;
    let operator: '+=' | '-=';
    
    if (check(state, 'PLUS_EQUALS')) {
      advance(state);
      operator = '+=';
    } else if (check(state, 'MINUS_EQUALS')) {
      advance(state);
      operator = '-=';
    } else {
      throw new ParseError(
        ParseErrorCode.INVALID_EFFECT,
        'Expected += or -= for reputation',
        current(state).span
      );
    }
    
    const value = parseFloat(consume(state, 'NUMBER', 'Expected reputation value').value);
    skipNewlines(state);
    
    return {
      type: 'ReputationEffect',
      faction,
      operator,
      value,
      span: spanFrom(startToken, current(state), state.filename),
    } satisfies ReputationEffect;
  }
  
  if (keyword === 'discoverPort') {
    const portId = consume(state, 'IDENTIFIER', 'Expected port ID').value;
    skipNewlines(state);
    
    return {
      type: 'DiscoverPortEffect',
      portId,
      span: spanFrom(startToken, current(state), state.filename),
    } satisfies DiscoverPortEffect;
  }
  
  if (keyword === 'removeCargoByTag') {
    const tag = consume(state, 'IDENTIFIER', 'Expected cargo tag').value;
    let count = 1;
    if (check(state, 'NUMBER')) {
      count = parseInt(advance(state).value, 10);
    }
    skipNewlines(state);
    
    return {
      type: 'RemoveCargoByTagEffect',
      tag,
      count,
      span: spanFrom(startToken, current(state), state.filename),
    } satisfies RemoveCargoByTagEffect;
  }
  
  throw new ParseError(
    ParseErrorCode.INVALID_EFFECT,
    `Unknown effect: ${keyword}`,
    startToken.span
  );
}

function parseNavigation(state: ParserState): NavigationTarget {
  const startToken = consume(state, 'ARROW', 'Expected ->');
  const targetToken = consume(state, 'IDENTIFIER', 'Expected passage name or END');
  const target = targetToken.value;
  
  skipNewlines(state);
  
  return {
    type: 'NavigationTarget',
    target,
    isEnd: target === 'END',
    span: spanFrom(startToken, targetToken, state.filename),
  };
}

export function parse(source: string, filename: string = '<input>'): SceneFile {
  const tokens = lex(source, filename);
  const state = createParser(tokens, filename);
  
  skipNewlines(state);
  
  const frontmatter = parseFrontmatter(state);
  const passages: Passage[] = [];
  
  while (!isAtEnd(state)) {
    skipNewlines(state);
    if (isAtEnd(state)) break;
    
    if (check(state, 'PASSAGE_HEADER')) {
      passages.push(parsePassage(state));
    } else {
      advance(state);
    }
  }
  
  const lastToken = state.tokens[state.tokens.length - 1]!;
  
  return {
    type: 'SceneFile',
    frontmatter,
    passages,
    span: spanFrom(state.tokens[0]!, lastToken, filename),
  };
}
