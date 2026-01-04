#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '../parser/parser.js';
import { astToScenelet } from '../compiler/compiler.js';
import { ParseError } from '../parser/errors.js';

const program = new Command();

program
  .name('holdsmith')
  .description('Scene DSL toolkit for narrative games')
  .version('0.1.0');

program
  .command('validate')
  .description('Validate .scene files')
  .argument('<input>', 'Input directory containing .scene files')
  .action((input: string) => {
    const files = findSceneFiles(input);
    
    if (files.length === 0) {
      console.error(`No .scene files found in ${input}`);
      process.exit(1);
    }
    
    let hasErrors = false;
    let errorCount = 0;
    let warningCount = 0;
    
    for (const file of files) {
      try {
        const source = readFileSync(file, 'utf-8');
        const ast = parse(source, file);
        const result = astToScenelet(ast);
        
        for (const warning of result.warnings) {
          warningCount++;
          console.warn(`Warning: ${file}:${warning.line ?? 0}: ${warning.message}`);
        }
      } catch (err) {
        hasErrors = true;
        errorCount++;
        if (err instanceof ParseError) {
          console.error(`Error: ${file}:${err.span.start.line}: ${err.message}`);
        } else {
          console.error(`Error: ${file}: ${err}`);
        }
      }
    }
    
    console.log(`\nValidated ${files.length} file(s): ${errorCount} error(s), ${warningCount} warning(s)`);
    
    if (hasErrors) {
      process.exit(1);
    }
  });

program
  .command('parse')
  .description('Parse a single .scene file and output AST as JSON')
  .argument('<file>', 'Scene file to parse')
  .option('--scenelet', 'Output transformed Scenelet instead of AST')
  .action((file: string, options: { scenelet?: boolean }) => {
    try {
      const source = readFileSync(file, 'utf-8');
      const ast = parse(source, file);
      
      if (options.scenelet) {
        const result = astToScenelet(ast);
        console.log(JSON.stringify(result.scenelet, null, 2));
        if (result.warnings.length > 0) {
          console.error('\nWarnings:');
          for (const w of result.warnings) {
            console.error(`  ${w.message}`);
          }
        }
      } else {
        console.log(JSON.stringify(ast, null, 2));
      }
    } catch (err) {
      if (err instanceof ParseError) {
        console.error(`Parse error: ${err.message}`);
      } else {
        console.error(`Error: ${err}`);
      }
      process.exit(1);
    }
  });

function findSceneFiles(dir: string): string[] {
  const files: string[] = [];
  
  function walk(currentDir: string) {
    const entries = readdirSync(currentDir);
    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (entry.endsWith('.scene')) {
        files.push(fullPath);
      }
    }
  }
  
  walk(dir);
  return files;
}

program.parse();
