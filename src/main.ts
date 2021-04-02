// tslint:disable-next-line:no-console
import npm from 'npm';
import async from 'async';
import fs from 'fs';
import path from 'path';
import { ManifestResult } from 'pacote';
import recursiveReadDir from 'recursive-readdir';
import { extractNameAndVersionFromFilename, isPackageExists } from './verdaccio-integration';
import { v4 as uuidv4 } from 'uuid';
import { mvSync } from './utils';

interface EnvVariables {
  REGISTRY: string;
  LISTEN_PACKAGES_DIRECTORY: string;
  BACKUP_DIRECTORY: string;
  ERROR_DIRECTORY: string;
  VERDACCIO_CONF_FILEPATH: string;
}
const getValidEnvironmentVariables = (): EnvVariables => {
  let { REGISTRY, LISTEN_PACKAGES_DIRECTORY, BACKUP_DIRECTORY, ERROR_DIRECTORY, VERDACCIO_CONF_FILEPATH } = process.env;
  const mandatoryEnvVariables = [
    'REGISTRY',
    'LISTEN_PACKAGES_DIRECTORY',
    'VERDACCIO_CONF_FILEPATH',
    'BACKUP_DIRECTORY',
    'ERROR_DIRECTORY',
  ];
  if (!mandatoryEnvVariables.every(v => !!process.env[v])) {
    throw new Error(`MUST PASS ENV VARIABLES: ${mandatoryEnvVariables}`);
  }
  if (![LISTEN_PACKAGES_DIRECTORY, BACKUP_DIRECTORY, ERROR_DIRECTORY].every(d => fs.existsSync(d!))) {
    throw new Error(
      `Must Be Valid Directories: \nLISTEN_PACKAGES_DIRECTORY=${LISTEN_PACKAGES_DIRECTORY}\nBACKUP_DIRECTORY=${BACKUP_DIRECTORY}\nERROR_DIRECTORY=${ERROR_DIRECTORY}\n`,
    );
  }
  process.env['LISTEN_PACKAGES_DIRECTORY'] = LISTEN_PACKAGES_DIRECTORY = path.resolve(LISTEN_PACKAGES_DIRECTORY!);
  process.env['BACKUP_DIRECTORY'] = BACKUP_DIRECTORY = path.resolve(BACKUP_DIRECTORY!);
  process.env['ERROR_DIRECTORY'] = ERROR_DIRECTORY = path.resolve(ERROR_DIRECTORY!);
  process.env['VERDACCIO_CONF_FILEPATH'] = VERDACCIO_CONF_FILEPATH = path.resolve(VERDACCIO_CONF_FILEPATH!);

  return { REGISTRY: REGISTRY!, LISTEN_PACKAGES_DIRECTORY, BACKUP_DIRECTORY, ERROR_DIRECTORY, VERDACCIO_CONF_FILEPATH };
};
const {
  REGISTRY,
  LISTEN_PACKAGES_DIRECTORY,
  BACKUP_DIRECTORY,
  ERROR_DIRECTORY,
  VERDACCIO_CONF_FILEPATH,
} = getValidEnvironmentVariables();

const setupNpm = (): Promise<void> => {
  return new Promise(resolve => npm.load(() => resolve()));
};

const publishFilepath = (filepath: string): Promise<ManifestResult | undefined> => {
  return new Promise((resolve, reject) => {
    npm.commands.publish([filepath, `--registry=${REGISTRY}`], (err: any, result: any) => {
      if (err?.name && err?.version) {
        result = err;
        console.log(`${path.basename(filepath)}\t\t\t+ Published!`);
        return resolve(result as ManifestResult);
      }
      if (err?.message?.includes('over existing version.')) {
        return resolve(undefined);
      }
      console.log(`${path.basename(filepath)}\t\t- Error! ${err.message}`, err);
      return reject(err);
    });
  });
};

interface FilePublishData {
  packageName: string;
  version: string;
  exists: boolean;
  filepath: string;
  filename: string;
  successPublish?: boolean;
}

const stripedLatestFromFilenames = (filepaths: string[]): string[] => {
  return filepaths.map(filepath => {
    const fileDir = path.dirname(filepath);
    const filename = path.basename(filepath);
    let fixedFilename = filename;
    if (filename.includes('-latest.')) {
      fixedFilename = filename.replace(/^(.+?)(?:-latest)?\.(tgz|tar)$/, '$1.$2');
      fs.renameSync(filepath, path.join(fileDir, fixedFilename));
    }
    return path.join(fileDir, fixedFilename);
  });
};
const publishDirectory = async (directory: string): Promise<[FilePublishData[], FilePublishData[]]> => {
  const filepaths = stripedLatestFromFilenames(
    (await recursiveReadDir(directory)).filter(file => file.endsWith('.tgz') || file.endsWith('.tar')),
  );
  console.log(`Got ${filepaths.length} Files in Folder ${path.basename(directory)}`);

  const filesData: FilePublishData[] = (
    await async.mapLimit<string, FilePublishData | null, Error>(filepaths, 50, async (filepath, cb) => {
      const filename = path.basename(filepath);
      try {
        const { name: packageName, version } = extractNameAndVersionFromFilename(filename);
        const exists = isPackageExists(packageName, version, { filepath, filename });
        return { packageName, version, exists, filepath, filename };
      } catch (err) {
        console.log(err);
        return null;
      }
    })
  ).filter(r => r) as FilePublishData[];

  const filesExists = filesData.filter(file => file.exists);
  const filesNeedsPublishing = filesData.filter(file => !file.exists);
  if (filesExists.length > 0) {
    console.log(`${filesExists.length}/${filesData.length} Already Exist`);
  }
  if (filesNeedsPublishing.length > 0) {
    console.log(`${filesNeedsPublishing.length}/${filesData.length} Don't Exist - Publishing now`);
  }

  const resultsFiles: FilePublishData[] = await async.mapLimit(filesNeedsPublishing, 10, async (fileData, cb) => {
    try {
      const result = await publishFilepath(fileData.filepath);
      return { ...fileData, successPublish: true };
    } catch (err) {
      console.log(err);
      return { ...fileData, successPublish: false };
    }
  });
  const successResults = resultsFiles.filter(f => f.successPublish);
  const errorResults = resultsFiles.filter(f => !f.successPublish);

  return [successResults, errorResults];
};
const moveFilesToDirInsideListeningDir = async () => {
  /* moving single-files to dir inside listening directory */
  const files = fs
    .readdirSync(LISTEN_PACKAGES_DIRECTORY, { withFileTypes: true })
    .filter(f => f.isFile() && (f.name.endsWith('.tgz') || f.name.endsWith('.tar')));
  if (files.length > 0) {
    const newDir = path.join(LISTEN_PACKAGES_DIRECTORY, uuidv4().slice(0, 7));
    console.log(`Found ${files.length} Files in Root Listening Directory! Moving to sub-directory ${newDir}`);
    fs.mkdirSync(newDir, { recursive: true });
    await async.eachLimit(files, 10, async file => {
      const origFilepath = path.join(LISTEN_PACKAGES_DIRECTORY, file.name);
      const dstFilepath = path.join(newDir, file.name);
      return mvSync(origFilepath, dstFilepath, { mkdirp: true });
    });
    console.log(`Moved ${files.length} Files to sub-directory ${newDir}`);
  }
};
const listenAndPublish = async () => {
  await moveFilesToDirInsideListeningDir();
  const paths = fs.readdirSync(LISTEN_PACKAGES_DIRECTORY, { withFileTypes: true });
  const dirs = paths.filter(f => f.isDirectory());
  if (dirs.length > 0) {
    console.log(`Found ${dirs.length} Directories!`);
  }
  for (const dir of dirs) {
    const dirPath = path.join(LISTEN_PACKAGES_DIRECTORY, dir.name);
    console.log(`Publishing ${dir.name} Directory...`);
    const [successResults, errorResults] = await publishDirectory(dirPath);
    let newDirName = dir.name;
    if (fs.existsSync(path.join(BACKUP_DIRECTORY, newDirName))) {
      newDirName = `${dir.name}-${uuidv4().slice(0, 5)}`;
    }
    const backupDir = path.join(BACKUP_DIRECTORY, newDirName);
    const errorBackupDir = path.join(ERROR_DIRECTORY, newDirName);
    if (successResults.length > 0) {
      console.log(`Finished Publishing ${successResults.length} Files!`);
    }

    // Moving error-files to error-backup-dir
    if (errorResults.length > 0) {
      fs.mkdirSync(errorBackupDir, { recursive: true });
      await async.eachLimit(errorResults, 10, async file => {
        const dstNewFilepath = path.join(errorBackupDir, file.filename);
        if (fs.existsSync(dstNewFilepath)) {
          return fs.rmSync(file.filepath); // removing src-filepath
        }
        return mvSync(file.filepath, dstNewFilepath, { mkdirp: true });
      });
    }

    try {
      // Moving dir to backup-dir
      console.log(`Moving Folder ${path.basename(dirPath)} to Backup (as: ${path.basename(backupDir)})`);
      await mvSync(dirPath, backupDir, { mkdirp: true });
    } catch (err) {
      console.error(err);
    }
  }
};

export const startListeningAndPublishing = async () => {
  console.log('Loading npm...');

  await setupNpm();
  console.log('Loaded npm!');
  console.log('Starting Interval Main Listener...');

  let instaceRunning = false;
  setInterval(async () => {
    if (instaceRunning) return;
    instaceRunning = true;
    await listenAndPublish();
    instaceRunning = false;
  }, parseInt(process.env.INTERVAL || '2000'));
  // await listenAndPublish();
};
