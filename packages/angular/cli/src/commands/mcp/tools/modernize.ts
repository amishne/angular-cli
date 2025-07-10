import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SchematicTestRunner, UnitTestTree } from '@angular-devkit/schematics/testing';
import { Tree } from '@angular-devkit/schematics';
import { z } from 'zod';
import path from 'node:path';

export function registerModernizeTool(server: McpServer): void {
  server.registerTool(
    'modernize',
    {
      title: 'Modernize Angular Code',
      description:
        'Runs migrations on Angular code to make it more modern and idiomatic. ' +
        'This tool should be run when creating new Angular code, or when existing Angular code needs to be updated. ' +
        'It can apply transformations for things like control flow, self-closing tags, and dependency injection.',
      inputSchema: {
        files: z.array(
          z.object({
            name: z.string().describe('The name of the file.'),
            content: z.string().describe('The content of the file.'),
          }),
        ),
      },
      outputSchema: {
        files: z.array(
          z.object({
            name: z.string().describe('The name of the file.'),
            content: z.string().describe('The updated content of the file.'),
          }),
        ),
      },
    },
    async (input) => {
      try {
        const migrationRunner = new SchematicTestRunner(
          '@angular/core',
          path.join(
            __dirname,
            '../../../../../../node_modules/@angular/core/schematics/migrations.json',
          ),
        );

        const collectionRunner = new SchematicTestRunner(
          '@angular/core',
          path.join(
            __dirname,
            '../../../../../../node_modules/@angular/core/schematics/collection.json',
          ),
        );

        let tree: Tree = new UnitTestTree(Tree.empty());
        for (const file of input.files) {
          tree.create(file.name, file.content);
        }

        for (const file of input.files) {
          if (file.name.endsWith('.ts')) {
            tree = await migrationRunner.runSchematic('test-bed-get', {}, tree);
            tree = await migrationRunner.runSchematic('inject-flags', {}, tree);
          } else if (file.name.endsWith('.html') || file.name.endsWith('.ng.html')) {
            tree = await migrationRunner.runSchematic('control-flow-migration', {}, tree);
            tree = await collectionRunner.runSchematic('self-closing-tags-migration', {}, tree);
          }
        }

        const updatedFiles = input.files.map((file) => {
          const updatedContent = tree.read(file.name)?.toString() ?? file.content;
          return {
            name: file.name,
            content: updatedContent,
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
