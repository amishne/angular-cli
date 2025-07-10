import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SchematicTestRunner, UnitTestTree } from '@angular-devkit/schematics/testing';
import { Tree } from '@angular-devkit/schematics';
import { z } from 'zod';
import path from 'node:path';

interface Transformation {
  name: string;
  description: string;
  documentationUrl: string;
  instructions?: string;
}

const TRANSFORMATIONS: Array<Transformation> = [
  {
    name: 'control-flow-migration',
    description:
      'Migrates from `*ngIf`, `*ngFor`, and `*ngSwitch` to the new `@if`, `@for`, and `@switch` block syntax in templates.',
    documentationUrl: 'https://angular.dev/reference/migrations/control-flow',
  },
  {
    name: 'self-closing-tags-migration',
    description:
      'Converts tags for elements with no content to be self-closing (e.g., `<app-foo></app-foo>` becomes `<app-foo />`).',
    documentationUrl: 'https://angular.dev/reference/migrations/self-closing-tags',
  },
  {
    name: 'test-bed-get',
    description:
      'Updates `TestBed.get` to the preferred and type-safe `TestBed.inject` in TypeScript test files.',
    documentationUrl: 'https://angular.dev/guide/testing/dependency-injection',
  },
  {
    name: 'inject-flags',
    description:
      'Updates `inject` calls from using the InjectFlags enum to a more modern and readable options object.',
    documentationUrl: 'https://angular.dev/reference/migrations/inject-function',
  },
  {
    name: 'output-migration',
    description: 'Converts `@Output` declarations to the new functional `output()` syntax.',
    documentationUrl: 'https://angular.dev/reference/migrations/outputs',
  },
  {
    name: 'signal-input-migration',
    description: 'Migrates `@Input` declarations to the new signal-based `input()` syntax.',
    documentationUrl: 'https://angular.dev/reference/migrations/signal-inputs',
  },
  {
    name: 'signal-queries-migration',
    description:
      'Migrates `@ViewChild` and `@ContentChild` queries to their signal-based `viewChild` and `contentChild` versions.',
    documentationUrl: 'https://angular.dev/reference/migrations/signal-queries',
  },
  {
    name: 'standalone',
    description:
      'Converts the application to use standalone components, directives, and pipes. This is a three-step process. After each step, you should verify that your application builds and runs correctly.',
    instructions: `This migration requires running a cli schematic multiple times. Run the commands in the order listed below, verifying that your code builds and runs between each step:

1. Run 
`ng g @angular/core:standalone` and select