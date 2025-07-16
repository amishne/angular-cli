import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SchematicTestRunner, UnitTestTree } from '@angular-devkit/schematics/testing';
import { Tree } from '@angular-devkit/schematics';
import { z } from 'zod';
import path from 'node:path';

export const SCHEMATICS_ROOT = '../../../../../../node_modules/@angular/core/schematics';

enum SchematicTarget {
  Code,
  Template,
}

enum SchematicRunner {
  Migration,
  Collection,
}

const TRANSFORMATIONS = [
  {
    name: 'control-flow-migration',
    description:
      'Migrates from `*ngIf`, `*ngFor`, and `*ngSwitch` to the new `@if`, `@for`, and `@switch` block syntax in templates.',
    target: SchematicTarget.Template,
    runner: SchematicRunner.Collection,
    includedByDefault: true,
    documentation: 'https://angular.dev/reference/migrations/control-flow',
  },
  {
    name: 'self-closing-tags-migration',
    description:
      'Converts tags for elements with no content to be self-closing (e.g., `<app-foo></app-foo>` becomes `<app-foo />`).',
    target: SchematicTarget.Template,
    runner: SchematicRunner.Collection,
    includedByDefault: true,
    documentation: 'https://angular.dev/reference/migrations/self-closing-tags',
  },
  {
    name: 'test-bed-get',
    description:
      'Updates `TestBed.get` to the preferred and type-safe `TestBed.inject` in TypeScript test files.',
    target: SchematicTarget.Code,
    runner: SchematicRunner.Migration,
    includedByDefault: true,
    documentation: 'https://angular.dev/guide/testing/dependency-injection',
  },
  {
    name: 'inject-flags',
    description:
      'Updates `inject` calls from using the InjectFlags enum to a more modern and readable options object.',
    target: SchematicTarget.Code,
    runner: SchematicRunner.Migration,
    includedByDefault: true,
    documentation: 'https://angular.dev/reference/migrations/inject-function',
  },
  {
    name: 'output-migration',
    description: 'Converts `@Output` declarations to the new functional `output()` syntax.',
    target: SchematicTarget.Code,
    runner: SchematicRunner.Collection,
    includedByDefault: true,
    documentation: 'https://angular.dev/reference/migrations/outputs',
  },
  {
    name: 'signal-input-migration',
    description: 'Migrates `@Input` declarations to the new signal-based `input()` syntax.',
    target: SchematicTarget.Code,
    runner: SchematicRunner.Collection,
    includedByDefault: true,
    documentation: 'https://angular.dev/reference/migrations/signal-inputs',
  },
  {
    name: 'signal-queries-migration',
    description:
      'Migrates `@ViewChild` and `@ContentChild` queries to their signal-based `viewChild` and `contentChild` versions.',
    target: SchematicTarget.Code,
    runner: SchematicRunner.Collection,
    includedByDefault: true,
    documentation: 'https://angular.dev/reference/migrations/signal-queries',
  },
  {
    name: 'standalone',
    description:
      'Converts the application to use standalone components, directives, and pipes. This is a three-step process. After each step, you should verify that your application builds and runs correctly. Full instructions at https://angular.dev/reference/migrations/standalone',
    target: SchematicTarget.Code,
    runner: SchematicRunner.Collection,
    includedByDefault: false,
    documentation: 'https://angular.dev/reference/migrations/standalone',
  },
  {
    name: 'zoneless',
    description: 'Migrates the application to be zoneless.',
    includedByDefault: false,
    documentation: 'https://angular.dev/guide/zoneless',
  },
] as const;

const ALL_TRANSFORMATIONS = TRANSFORMATIONS.map((t) => t.name);

export function registerModernizeTool(server: McpServer): void {
  server.registerTool(
    'modernize',
    {
      title: 'Modernize Angular Code',
      description:
        '<Purpose>\n' +
        'This tool modernizes Angular code by applying the latest best practices and syntax improvements, ensuring it is idiomatic, readable, and maintainable.\n\n' +
        '</Purpose>\n' +
        '<Use Cases>\n' +
        '* After generating new code: Run this tool immediately after creating new Angular components, directives, or services to ensure they adhere to modern standards.\n' +
        '* On existing code: Apply to existing TypeScript files (.ts) and Angular templates (.ng.html) to update them with the latest features, such as the new built-in control flow syntax.\n\n' +
        '* When the user asks for a specific transformation: When the transformation list is populated, these specific ones will be ran on the inputs.\n' +
        '</Use Cases>\n' +
        '<Transformations>\n' +
        '<Default Transformations>\n' +
        TRANSFORMATIONS.filter((t) => t.includedByDefault)
          .map((t) => `* ${t.name}: ${t.description}`)
          .join('\n') +
        '\n</Default Transformations>\n' +
        '<On-Request Transformations>\n' +
        TRANSFORMATIONS.filter((t) => !t.includedByDefault)
          .map((t) => `* ${t.name}: ${t.description}`)
          .join('\n') +
        '/\n<On-Request Transformations>\n' +
        '\n</Transformations>\n',
      inputSchema: {
        files: z.array(
          z.object({
            name: z.string().describe('The name of the file.'),
            content: z.string().describe('The content of the file.'),
          }),
        ),
        // Zod's `enum` requires a non-empty array of string literals, but TypeScript
        // infers `ALL_TRANSFORMATIONS` as `string[]`. The `as` cast is a
        // workaround to satisfy Zod's type checker.
        transformations: z
          .array(z.enum(ALL_TRANSFORMATIONS as [string, ...string[]]))
          .optional(),
        mode: z
          .enum(['convert-to-standalone', 'prune-ng-modules', 'standalone-bootstrap'])
          .optional()
          .describe('The mode to use for the standalone transformation.'),
      },
      outputSchema: {
        files: z.array(
          z.object({
            name: z.string().describe('The name of the file.'),
            content: z.string().optional().describe('The updated content of the file.'),
            changed: z.boolean().describe('Whether the file was changed.'),
          }),
        ),
        instructions: z.string().optional().describe('Additional instructions.'),
        documentation: z.string().optional().describe('A link to relevant documentation.'),
      },
    },
    async (input) => {
      try {
        // We don't have access to the file system to run schematics on it directly. Instead we
        // use the test runner to create a virtual filesystem, populate it with the input files,
        // and run the schematics on them.

        const runners = {
          [SchematicRunner.Migration]: new SchematicTestRunner(
            '@angular/core',
            path.join(__dirname, SCHEMATICS_ROOT, 'migrations.json'),
          ),
          [SchematicRunner.Collection]: new SchematicTestRunner(
            '@angular/core',
            path.join(__dirname, SCHEMATICS_ROOT, 'collection.json'),
          ),
        };

        const transformationsToRun =
          input.transformations && input.transformations.length > 0
            ? TRANSFORMATIONS.filter((t) => input.transformations!.includes(t.name))
            : TRANSFORMATIONS.filter((t) => t.includedByDefault);

        const hasCodeFiles = input.files.some((f) => f.name.endsWith('.ts'));
        const hasTemplateFiles = input.files.some(
          (f) => f.name.endsWith('.html') || f.name.endsWith('.ng.html'),
        );

        let tree: Tree = new UnitTestTree(Tree.empty());
        for (const file of input.files) {
          tree.create(file.name, file.content);
        }

        let instructions: string | undefined;
        const documentation = new Set<string>();

        for (const transformation of transformationsToRun) {
          if (transformation.documentation) {
            documentation.add(transformation.documentation);
          }
          if (transformation.name === 'standalone') {
            const mode = input.mode ?? 'convert-to-standalone';
            tree = await runners[transformation.runner].runSchematic('standalone', { mode }, tree);

            if (mode === 'convert-to-standalone') {
              instructions =
                'The first step of the `standalone` migration has been performed. Please verify that your application builds and runs correctly. Then, run this tool again with `mode: "prune-ng-modules"` to continue.';
            } else if (mode === 'prune-ng-modules') {
              instructions =
                'The second step of the `standalone` migration has been performed. Please verify that your application builds and runs correctly. Then, run this tool again with `mode: "standalone-bootstrap"` to complete the migration.';
            } else {
              instructions = 'The `standalone` migration has been completed.';
            }
          } else if (transformation.name === 'zoneless') {
            instructions =
              'The `zoneless` migration is a manual process. Please follow the instructions at https://angular.dev/guide/zoneless to complete the migration.';
          } else if (transformation.target === SchematicTarget.Code && hasCodeFiles) {
            tree = await runners[transformation.runner].runSchematic(transformation.name, {}, tree);
          } else if (transformation.target === SchematicTarget.Template && hasTemplateFiles) {
            tree = await runners[transformation.runner].runSchematic(transformation.name, {}, tree);
          }
        }

        const updatedFiles = input.files.map((file) => {
          const updatedContent = tree.read(file.name)?.toString();
          const changed = updatedContent !== undefined && updatedContent !== file.content;

          return {
            name: file.name,
            content: changed ? updatedContent : undefined,
            changed,
          };
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: 'Modernization migrations applied successfully.',
            },
          ],
          structuredContent: {
            files: updatedFiles,
            instructions,
            documentation: documentation.size > 0 ? [...documentation].join('\n') : undefined,
          },
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : 'An unknown error occurred.';
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to run modernization migrations: ${message}`,
            },
          ],
        };
      }
    },
  );
}