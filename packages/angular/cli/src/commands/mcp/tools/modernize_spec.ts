import { ModernizeInput, runModernization } from './modernize';
import { of } from 'rxjs';
import { NodeWorkflow } from '@angular-devkit/schematics/tools';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';

class MockNodeWorkflow {
  execute() {
    return of();
  }
}

describe('Modernize Tool', () => {
  let workflow: NodeWorkflow;
  let executeSpy: jasmine.Spy;

  beforeEach(() => {
    workflow = new MockNodeWorkflow() as unknown as NodeWorkflow;
    executeSpy = spyOn(workflow, 'execute').and.callThrough();
  });

  it('should run a simple transformation', async () => {
    const input: ModernizeInput = {
      files: [{ name: 'test.ng.html', content: '<app-foo></app-foo>' }],
      transformations: ['self-closing-tags-migration'],
    };

    await runModernization(input, workflow);

    expect(executeSpy).toHaveBeenCalledWith(
      jasmine.objectContaining({
        schematic: 'self-closing-tags-migration',
      }),
    );
  });

  it('should return instructions for standalone migration', async () => {
    const input: ModernizeInput = {
      files: [{ name: 'test.ts', content: 'console.log("hello")' }],
      transformations: ['standalone'],
      mode: 'convert-to-standalone',
    };

    const result = await runModernization(input, workflow);

    if ('instructions' in result.structuredContent) {
      expect(result.structuredContent.instructions).toContain(
        'The first step of the `standalone` migration has been performed.',
      );
    } else {
      fail('Expected instructions to be present in the result');
    }
  });

  it('should not run schematics if there are no applicable files', async () => {
    const input: ModernizeInput = {
      files: [{ name: 'test.txt', content: 'hello' }],
      transformations: ['self-closing-tags-migration'],
    };

    await runModernization(input, workflow);

    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('should run the default transformations when none are specified', async () => {
    const input: ModernizeInput = {
      files: [
        { name: 'test.ng.html', content: '<app-foo></app-foo>' },
        { name: 'test.ts', content: 'console.log("hello")' },
      ],
    };

    await runModernization(input, workflow);

    const defaultTransformations = [
      'control-flow-migration',
      'self-closing-tags-migration',
      'test-bed-get',
      'inject-flags',
      'output-migration',
      'signal-input-migration',
      'signal-queries-migration',
    ];

    expect(executeSpy.calls.count()).toBe(defaultTransformations.length);
    const executedSchematics = executeSpy.calls.all().map((call) => call.args[0].schematic);
    expect(executedSchematics.sort()).toEqual(defaultTransformations.sort());
  });

  describe('File System Setup', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(tmpdir(), 'modernize-spec-'));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should write input files and tsconfig.json to the provided directory', async () => {
      const input: ModernizeInput = {
        files: [
          { name: 'src/app/app.component.ts', content: 'console.log("hello")' },
          { name: 'src/app/app.component.html', content: '<h1>hello</h1>' },
        ],
      };

      await runModernization(input, workflow, tempDir);

      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      expect(fs.existsSync(tsconfigPath)).toBe(true);
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
      expect(tsconfig.files).toEqual(['src/app/app.component.ts', 'src/app/app.component.html']);

      const componentTsPath = path.join(tempDir, 'src/app/app.component.ts');
      expect(fs.existsSync(componentTsPath)).toBe(true);
      expect(fs.readFileSync(componentTsPath, 'utf8')).toBe('console.log("hello")');
      const componentHtmlPath = path.join(tempDir, 'src/app/app.component.html');
      expect(fs.existsSync(componentHtmlPath)).toBe(true);
      expect(fs.readFileSync(componentHtmlPath, 'utf8')).toBe('<h1>hello</h1>');
    });

    it('should return updated file content', async () => {
      const input: ModernizeInput = {
        files: [{ name: 'test.ng.html', content: '<app-foo></app-foo>' }],
        transformations: ['self-closing-tags-migration'],
      };

      executeSpy.and.callFake(() => {
        fs.writeFileSync(path.join(tempDir, 'test.ng.html'), '<app-foo />');
        return of();
      });

      const result = await runModernization(input, workflow, tempDir);

      if (!('files' in result.structuredContent) || !result.structuredContent.files) {
        fail('Expected files to be present in the result');
        return;
      }

      const fileResult = result.structuredContent.files[0];
      expect(fileResult?.changed).toBe(true);
      expect(fileResult?.content).toBe('<app-foo />');
    });
  });
});
