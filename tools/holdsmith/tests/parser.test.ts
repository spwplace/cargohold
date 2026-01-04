import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lex } from '../src/parser/lexer.js';
import { parse } from '../src/parser/parser.js';
import { astToScenelet } from '../src/compiler/compiler.js';

const FIXTURES_DIR = new URL('./fixtures/valid/', import.meta.url).pathname;

describe('Lexer', () => {
  it('tokenizes frontmatter correctly', () => {
    const source = `---
id: test
title: Test
---`;
    const tokens = lex(source, 'test.scene');
    
    expect(tokens[0].type).toBe('FRONTMATTER_DELIM');
    expect(tokens.find(t => t.type === 'TEXT' && t.value.includes('id'))).toBeTruthy();
    expect(tokens[tokens.length - 2].type).toBe('FRONTMATTER_DELIM');
    expect(tokens[tokens.length - 1].type).toBe('EOF');
  });

  it('tokenizes passage headers', () => {
    const source = `---
id: test
---

=== intro

Some text.`;
    const tokens = lex(source, 'test.scene');
    const passageHeader = tokens.find(t => t.type === 'PASSAGE_HEADER');
    
    expect(passageHeader).toBeTruthy();
    expect(passageHeader?.value).toBe('intro');
  });

  it('tokenizes prose as whole lines in prose context', () => {
    const source = `---
id: test
---

=== intro

This is a complete sentence with punctuation!`;
    const tokens = lex(source, 'test.scene');
    const textToken = tokens.find(t => t.type === 'TEXT' && t.value.includes('sentence'));
    
    expect(textToken).toBeTruthy();
    expect(textToken?.value).toBe('This is a complete sentence with punctuation!');
  });

  it('tokenizes choices and effects', () => {
    const source = `---
id: test
---

=== intro

Text.

* [Choice]
  ~ credits += 10
  -> END`;
    const tokens = lex(source, 'test.scene');
    
    expect(tokens.filter(t => t.type === 'CHOICE_MARKER')).toHaveLength(1);
    expect(tokens.filter(t => t.type === 'EFFECT_MARKER')).toHaveLength(1);
    expect(tokens.filter(t => t.type === 'ARROW')).toHaveLength(1);
  });
});

describe('Parser', () => {
  it('parses simple.scene fixture', () => {
    const source = readFileSync(`${FIXTURES_DIR}/simple.scene`, 'utf-8');
    const ast = parse(source, 'simple.scene');
    
    expect(ast.type).toBe('SceneFile');
    expect(ast.frontmatter.id).toBe('simple_test');
    expect(ast.frontmatter.title).toBe('Simple Test Scene');
    expect(ast.frontmatter.tags).toEqual(['test']);
    expect(ast.frontmatter.context).toBe('journey');
    expect(ast.passages).toHaveLength(1);
    
    const intro = ast.passages[0];
    expect(intro.name).toBe('intro');
    expect(intro.content).toHaveLength(3);
    
    const prose = intro.content[0];
    expect(prose.type).toBe('Prose');
    if (prose.type === 'Prose') {
      expect(prose.text).toContain('simple test scene');
    }
    
    const choice1 = intro.content[1];
    expect(choice1.type).toBe('Choice');
    if (choice1.type === 'Choice') {
      expect(choice1.text).toBe('First choice');
      expect(choice1.effects).toHaveLength(1);
      expect(choice1.effects[0].type).toBe('ResourceEffect');
    }
  });

  it('parses branching.scene fixture with multiple passages', () => {
    const source = readFileSync(`${FIXTURES_DIR}/branching.scene`, 'utf-8');
    const ast = parse(source, 'branching.scene');
    
    expect(ast.passages).toHaveLength(3);
    expect(ast.passages.map(p => p.name)).toEqual(['intro', 'left_path', 'right_path']);
    
    expect(ast.frontmatter.requires).toBeDefined();
    expect(ast.frontmatter.requires?.shipTags).toEqual(['sensor']);
    expect(ast.frontmatter.requires?.minResources).toEqual([{ resource: 'credits', value: 50 }]);
  });

  it('parses conditions on choices', () => {
    const source = readFileSync(`${FIXTURES_DIR}/branching.scene`, 'utf-8');
    const ast = parse(source, 'branching.scene');
    
    const intro = ast.passages[0];
    const goLeftChoice = intro.content.find(c => c.type === 'Choice' && c.text === 'Go left');
    
    expect(goLeftChoice).toBeDefined();
    if (goLeftChoice?.type === 'Choice') {
      expect(goLeftChoice.condition).toBeDefined();
      expect(goLeftChoice.condition?.clauses).toHaveLength(1);
      expect(goLeftChoice.condition?.clauses[0].type).toBe('TagCondition');
    }
  });

  it('parses chronicle effects with multi-line text', () => {
    const source = readFileSync(`${FIXTURES_DIR}/branching.scene`, 'utf-8');
    const ast = parse(source, 'branching.scene');
    
    const intro = ast.passages[0];
    const stayPutChoice = intro.content.find(c => c.type === 'Choice' && c.text === 'Stay put');
    
    if (stayPutChoice?.type === 'Choice') {
      const chronicleEffect = stayPutChoice.effects.find(e => e.type === 'ChronicleEffect');
      expect(chronicleEffect).toBeDefined();
      if (chronicleEffect?.type === 'ChronicleEffect') {
        expect(chronicleEffect.title).toBe('Indecision');
        expect(chronicleEffect.text).toContain("Couldn't make up our minds");
      }
    }
  });

  it('parses navigation targets', () => {
    const source = readFileSync(`${FIXTURES_DIR}/branching.scene`, 'utf-8');
    const ast = parse(source, 'branching.scene');
    
    const intro = ast.passages[0];
    const goLeftChoice = intro.content.find(c => c.type === 'Choice' && c.text === 'Go left');
    
    if (goLeftChoice?.type === 'Choice') {
      expect(goLeftChoice.target?.target).toBe('left_path');
      expect(goLeftChoice.target?.isEnd).toBe(false);
    }
  });
});

describe('Compiler', () => {
  it('compiles simple.scene to Scenelet structure', () => {
    const source = readFileSync(`${FIXTURES_DIR}/simple.scene`, 'utf-8');
    const ast = parse(source, 'simple.scene');
    const result = astToScenelet(ast);
    
    expect(result.scenelet.id).toBe('simple_test');
    expect(result.scenelet.title).toBe('Simple Test Scene');
    expect(result.scenelet.passages).toHaveLength(1);
    expect(result.scenelet.passages[0]!.choices).toHaveLength(2);
    expect(result.warnings).toHaveLength(0);
  });

  it('compiles resource effects correctly', () => {
    const source = readFileSync(`${FIXTURES_DIR}/simple.scene`, 'utf-8');
    const ast = parse(source, 'simple.scene');
    const result = astToScenelet(ast);
    
    const firstChoice = result.scenelet.passages[0]!.choices![0]!;
    expect(firstChoice.effects?.resources?.credits).toBe(10);
    
    const secondChoice = result.scenelet.passages[0]!.choices![1]!;
    expect(secondChoice.effects?.resources?.morale).toBe(-5);
  });

  it('compiles branching passages with navigation', () => {
    const source = readFileSync(`${FIXTURES_DIR}/branching.scene`, 'utf-8');
    const ast = parse(source, 'branching.scene');
    const result = astToScenelet(ast);
    
    expect(result.scenelet.passages).toHaveLength(3);
    
    const goLeftChoice = result.scenelet.passages[0]!.choices![0]!;
    expect(goLeftChoice.nextPassage).toBe(1);
    
    const goRightChoice = result.scenelet.passages[0]!.choices![1]!;
    expect(goRightChoice.nextPassage).toBe(2);
  });

  it('compiles requirements from frontmatter', () => {
    const source = readFileSync(`${FIXTURES_DIR}/branching.scene`, 'utf-8');
    const ast = parse(source, 'branching.scene');
    const result = astToScenelet(ast);
    
    expect(result.scenelet.requirements?.shipTags).toEqual(['sensor']);
    expect(result.scenelet.requirements?.minResources?.credits).toBe(50);
  });

  it('compiles choice conditions to requirements', () => {
    const source = readFileSync(`${FIXTURES_DIR}/branching.scene`, 'utf-8');
    const ast = parse(source, 'branching.scene');
    const result = astToScenelet(ast);
    
    const goLeftChoice = result.scenelet.passages[0]!.choices![0]!;
    expect(goLeftChoice.requirements?.crewTags).toEqual(['engineering']);
  });
});
