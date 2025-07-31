import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { NodeWorkflow } from '@angular-devkit/schematics/tools';
import { NodeJsSyncHost } from '@angular-devkit/core/node';
import { virtualFs } from '@angular-devkit/core';

export const SCHEMATICS_ROOT = '../../../../../../@angular/core/schematics';

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

const modernizeInputSchema = z.object({
  files: z.array(
    z.object({
      name: z.string().describe('The name of the file.'),
      content: z.string().describe('The content of the file.'),
    }),
  ),
  transformations: z.array(z.enum(ALL_TRANSFORMATIONS as [string, ...string[]])).optional(),
  mode: z
    .enum(['convert-to-standalone', 'prune-ng-modules', 'standalone-bootstrap'])
    .optional()
    .describe('The mode to use for the standalone transformation.'),
});

export type ModernizeInput = z.infer<typeof modernizeInputSchema>;

// Extracted logic for testability
export async function runModernization(
  input: ModernizeInput,
  workflow?: NodeWorkflow,
  tempDir?: string,
) {
  const ownTempDir = !tempDir;
  tempDir ??= fs.mkdtempSync(path.join(os.tmpdir(), 'angular-cli-modernize-'));
  try {
    const fileNames = input.files.map((f) => f.name);
    const tsconfig = {
      compilerOptions: {
        target: 'es2022',
        module: 'esnext',
        lib: ['es2022', 'dom'],
        skipLibCheck: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        useDefineForClassFields: false,
      },
      files: fileNames,
    };
    fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));
    for (const file of input.files) {
      const filePath = path.join(tempDir, file.name);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, file.content);
    }

    workflow ??= new NodeWorkflow(
      new virtualFs.ScopedHost(new NodeJsSyncHost(), path.normalize(tempDir) as any),
      {
        packageManager: 'pnpm',
        dryRun: false,
      },
    );

    const collectionPaths = {
      [SchematicRunner.Migration]: path.join(__dirname, SCHEMATICS_ROOT, 'migrations.json'),
      [SchematicRunner.Collection]: path.join(__dirname, SCHEMATICS_ROOT, 'collection.json'),
    };

    const transformationsToRun =
      input.transformations && input.transformations.length > 0
        ? TRANSFORMATIONS.filter((t) => input.transformations!.includes(t.name))
        : TRANSFORMATIONS.filter((t) => t.includedByDefault);

    const hasCodeFiles = input.files.some((f) => f.name.endsWith('.ts'));
    const hasTemplateFiles = input.files.some(
      (f) => f.name.endsWith('.html') || f.name.endsWith('.ng.html'),
    );

    let instructions: string | undefined;
    const documentation = new Set<string>();

    for (const transformation of transformationsToRun) {
      if (transformation.documentation) {
        documentation.add(transformation.documentation);
      }

      let options: { [key: string]: unknown } = { path: tempDir };
      if (transformation.name === 'standalone') {
        const mode = input.mode ?? 'convert-to-standalone';
        options = { ...options, mode };

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
        continue; // Don't run a schematic for zoneless
      }

      if (
        (transformation.target === SchematicTarget.Code && !hasCodeFiles) ||
        (transformation.target === SchematicTarget.Template && !hasTemplateFiles)
      ) {
        continue;
      }

      await workflow
        .execute({
          collection: collectionPaths[transformation.runner],
          schematic: transformation.name,
          options,
        })
        .toPromise();
    }

    const updatedFiles = input.files.map((file) => {
      const filePath = path.join(tempDir!, file.name);
      if (!fs.existsSync(filePath)) {
        return { name: file.name, content: undefined, changed: true };
      }
      const updatedContent = fs.readFileSync(filePath, 'utf8');
      const changed = updatedContent !== file.content;

      return {
        name: file.name,
        content: changed ? updatedContent : undefined,
        changed,
      };
    });

    const structuredContent = {
      files: updatedFiles,
      instructions,
      documentation: documentation.size > 0 ? [...documentation].join('\n') : undefined,
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(structuredContent) }],
      structuredContent,
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
      structuredContent: {},
      isError: true,
    };
  } finally {
    if (ownTempDir && tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

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
      annotations: {
        readOnlyHint: true,
      },
      inputSchema: modernizeInputSchema.shape,
      outputSchema: {
        files: z
          .array(
            z.object({
              name: z.string().describe('The name of the file.'),
              content: z.string().optional().describe('The updated content of the file.'),
              changed: z.boolean().describe('Whether the file was changed.'),
            }),
          )
          .optional(),
        instructions: z.string().optional().describe('Additional instructions.'),
        documentation: z.string().optional().describe('A link to relevant documentation.'),
      },
    },
    (input) => runModernization(input as ModernizeInput),
  );
}
