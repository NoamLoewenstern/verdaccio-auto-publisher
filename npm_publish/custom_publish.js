const util = require('util')
const log = require('npmlog')
const semver = require('semver')
const pack = require('libnpmpack')
const libpub = require('libnpmpublish').publish
const runScript = require('@npmcli/run-script')
const pacote = require('pacote')
const npa = require('npm-package-arg')
const npmFetch = require('npm-registry-fetch')

const flatten = require('./utils/config/flatten.js')
const otplease = require('./utils/otplease.js')
const { getContents, logTar } = require('./utils/tar.js')

// this is the only case in the CLI where we use the old full slow
// 'read-package-json' module, because we want to pull in all the
// defaults and metadata, like git sha's and default scripts and all that.
const readJson = util.promisify(require('read-package-json'))

const BaseCommand = require('./base-command.js')
class Publish extends BaseCommand {
  static get description () {
    return 'Publish a package'
  }

  /* istanbul ignore next - see test/lib/load-all-commands.js */
  static get name () {
    return 'publish'
  }

  /* istanbul ignore next - see test/lib/load-all-commands.js */
  static get params () {
    return ['tag', 'access', 'dry-run']
  }

  /* istanbul ignore next - see test/lib/load-all-commands.js */
  static get usage () {
    return [
      '[<folder>]',
    ]
  }

  exec (args, cb) {
    this.publish(args).then(cb).catch(cb)
  }

  async publish (args) {
    if (args.length === 0)
      args = ['.']

    const defaultTag = this.npm.config.get('tag')

    if (semver.validRange(defaultTag))
      throw new Error('Tag name must not be a valid SemVer range: ' + defaultTag.trim())
    const getRegistryFromArgs = () => {
      const argsRegistryIndex = args.findIndex(arg => arg.includes('--registry'))
          if (argsRegistryIndex){
            const match = args.join(' ').match(/registry[= ](?<registry_uri>[^ ]+?)( |$)/)
            if (!match){
              throw new Error(`Couldn't extract registry address correctly from args: ${args.join(' ')}`)
            }
            return match.groups.registry_uri
          }
    }
    const registry = getRegistryFromArgs() || this.npm.flatOptions.registry
    // this.npm.flatOptions.registry = registry
    const opts = { ...this.npm.flatOptions, registry }

    const spec = npa(args[0])
    let manifest = await this.getManifest(spec, opts)

    const tarballData = await pack(spec, opts)
    const pkgContents = await getContents(manifest, tarballData)

    // The purpose of re-reading the manifest is in case it changed,
    // so that we send the latest and greatest thing to the registry
    // note that publishConfig might have changed as well!
    manifest = await this.getManifest(spec, opts)
    await otplease(opts, opts => libpub(manifest, tarballData, opts))


    return pkgContents
  }

  // if it's a directory, read it from the file system
  // otherwise, get the full metadata from whatever it is
  getManifest (spec, opts) {
    if (spec.type === 'directory')
      return readJson(`${spec.fetchSpec}/package.json`)
    return pacote.manifest(spec, { ...opts, fullMetadata: true })
  }

  // for historical reasons, publishConfig in package.json can contain
  // ANY config keys that npm supports in .npmrc files and elsewhere.
  // We *may* want to revisit this at some point, and have a minimal set
  // that's a SemVer-major change that ought to get a RFC written on it.
  publishConfigToOpts (publishConfig) {
    // create a new object that inherits from the config stack
    // then squash the css-case into camelCase opts, like we do
    // this is Object.assign()'ed onto the base npm.flatOptions
    return flatten(publishConfig, {})
  }
}
module.exports = Publish
