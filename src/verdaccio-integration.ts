/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable no-console */
// import {} from

import fs from 'fs';
import path from 'path';
import { Config, Package, Logger } from '@verdaccio/types';
import _ from 'lodash';
import LocalStorage from 'verdaccio/build/lib/local-storage';
import { parseConfigFile } from 'verdaccio/build/lib/utils';
import AppConfig from 'verdaccio/build/lib/config';
const { VERDACCIO_CONF_FILEPATH } = process.env;
if (!VERDACCIO_CONF_FILEPATH || !fs.existsSync(VERDACCIO_CONF_FILEPATH))
  throw new Error(`Invliad Variable VERDACCIO_CONF_FILEPATH: ${VERDACCIO_CONF_FILEPATH}`);

const config: Config = new AppConfig(parseConfigFile(VERDACCIO_CONF_FILEPATH));
config.self_path = VERDACCIO_CONF_FILEPATH;

const mockLogger: Logger = {
  child: function () {
    return this;
  },
  debug: () => {},
  error: () => {},
  http: () => {},
  trace: () => {},
  warn: () => {},
  info: () => {},
};
const localStorage = new LocalStorage(config, mockLogger);

export const isPackageExists = (
  packageName: string,
  version: string,
  options: { filename: string; filepath: string },
): boolean => {
  const storagePackageDir = path.join(path.dirname(localStorage.config.self_path), 'storage', packageName);
  let dstTgzFile = path.join(storagePackageDir, options.filename);
  if (options.filename.startsWith('@')) {
    dstTgzFile = path.join(storagePackageDir, options.filename.replace(/@.+?-(.+)/, '$1'));
  }
  const packageJsonFilepath = path.join(storagePackageDir, 'package.json');
  if (!fs.existsSync(packageJsonFilepath)) {
    // checking tgz file isn't on disk, when the package.json their doesn't know about it
    if (fs.existsSync(dstTgzFile)) {
      fs.rmSync(dstTgzFile);
    }
    return false;
  }
  const packageData = JSON.parse(fs.readFileSync(packageJsonFilepath).toString());
  const exists = !!Object.keys(packageData.versions).includes(version);
  if (!exists && fs.existsSync(dstTgzFile)) {
    // checking tgz file isn't on disk, when the package.json their doesn't know about it
    fs.rmSync(dstTgzFile);
  } else if (exists && !fs.existsSync(dstTgzFile)) {
    fs.copyFileSync(options.filepath, dstTgzFile);
  }
  return exists;
};

export const extractNameAndVersionFromFilename = (tarPackageFilename: string): { name: string; version: string } => {
  const pattern = /^(?:(?<family>@[\w\.]+?)-)?(?<name>[\w\.-]+?)-(?<version>\d+\.\d+\.\d+(?:(?!-latest)\S+?)?)(?:-latest)?(?:\.tgz|\.tar)$/;
  const match = tarPackageFilename.match(pattern);
  if (!match) {
    throw new Error(`invalid regex on file: ${tarPackageFilename}`);
  }
  const { family, name, version } = match.groups!;
  const fullname = family ? `${family}/${name}` : name;
  if (!version) {
    console.error(`version is nullable: ${version}`);
  }
  return {
    name: fullname,
    version,
  };
};
