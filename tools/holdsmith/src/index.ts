export { lex } from './parser/lexer.js';
export type { Token, TokenType } from './parser/lexer.js';

export { parse } from './parser/parser.js';

export { ParseError, ParseErrorCode } from './parser/errors.js';

export * from './parser/ast.js';

export {
  astToScenelet,
  type RuntimeScenelet,
  type RuntimeRequirements,
  type RuntimePassage,
  type RuntimeChoice,
  type RuntimeEffects,
  type TransformResult,
  type TransformWarning,
  type ResourceBundle,
  type ResourceName,
} from './compiler/compiler.js';

import { parse } from './parser/parser.js';
import { astToScenelet, type RuntimeScenelet, type TransformWarning } from './compiler/compiler.js';

export interface ParseSceneResult {
  readonly scenelet: RuntimeScenelet;
  readonly warnings: TransformWarning[];
}

export function parseScene(source: string, filename?: string): ParseSceneResult {
  const ast = parse(source, filename);
  return astToScenelet(ast);
}
