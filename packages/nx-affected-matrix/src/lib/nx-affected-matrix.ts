import { Inputs } from './inputs';
import {
  getInput,
  info,
  setFailed,
  startGroup,
  endGroup,
  setOutput,
  debug,
} from '@actions/core';
import {
  Exec,
  retrieveGitBoundaries,
  nxPrintAffected,
  assertNxInstalled,
} from '../../../utils/src';

interface NxAffectedMatrix {
  include: { target: string; bucket: number; projects: string }[];
}

function chunkify<T>(arr: T[], numberOfChunks: number): T[][] {
  if (numberOfChunks < 2) return [arr];

  const len = arr.length;
  const result = [];
  let i = 0;
  let size;

  if (len % numberOfChunks === 0) {
    size = Math.floor(len / numberOfChunks);
    while (i < len) {
      result.push(arr.slice(i, (i += size)));
    }
  } else {
    while (i < len) {
      size = Math.ceil((len - i) / numberOfChunks--);
      result.push(arr.slice(i, (i += size)));
    }
  }

  return result;
}

async function generateAffectedMatrix(
  { targets, maxParallel }: Inputs,
  exec: Exec
): Promise<NxAffectedMatrix> {
  startGroup(`⚙️ Generating affected matrix for ${targets}`);
  const matrix = {
    include: [],
  };

  const [base, head] = await retrieveGitBoundaries(exec);

  for (const target of targets) {
    exec.withArgs(`--base=${base}`, `--head=${head}`);
    debug(`🐞 Calculating affected for "${target}" target`);
    const projects = await nxPrintAffected(target, exec);
    const affectedTargets = chunkify(projects, maxParallel)
      .map((projects, idx) => ({
        target,
        bucket: idx + 1,
        projects: projects.join(','),
      }))
      .filter((target) => target.projects !== '');

    if (affectedTargets.length) {
      matrix.include.push(...affectedTargets);
    }
  }

  debug(`🐞 matrix: ${matrix}`);
  info(`✅ Generated affected matrix`);
  endGroup();

  return matrix;
}

async function main(): Promise<void> {
  const inputs: Inputs = {
    targets: getInput('targets', { required: true })
      .split(',')
      .filter((target) => target.length > 0),
    maxParallel: isNaN(parseInt(getInput('maxParallel')))
      ? 3
      : parseInt(getInput('maxParallel')),
    workingDirectory: getInput('workingDirectory'),
    args: getInput('args')
      .split(' ')
      .filter((arg) => arg.length > 0),
    nxCloud: getInput('nxCloud') === 'true',
  };

  if (inputs.workingDirectory && inputs.workingDirectory.length > 0) {
    info(`🏃 Working in custom directory: ${inputs.workingDirectory}`);
    process.chdir(inputs.workingDirectory);
  }

  try {
    await assertNxInstalled();

    const exec = new Exec();
    const matrix = await generateAffectedMatrix(inputs, exec);

    setOutput('matrix', matrix);
    setOutput(
      'hasChanges',
      !!matrix.include.find((target) => target.projects.length)
    );
  } catch (e) {
    setFailed(e);
  }
}

void main();