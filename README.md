## Auto-Publisher to Verdaccio NPM Registry

## Use Case

If you are using verdaccio for as an offline-registry, and you keep on needing to add packages with minimal-effort, THIS IS FOR YOU :D
This projects listens/monitors the 'listen' folder, and has access to the actual verdaccio-storage directory, and publishers all the packages which don't already exists on the registry, without querying the registry for every package (can be thousands at a time).
It essentially acts as the verdaccio-server acts for checking packages on the disk (volume). Saves A LOT of time, since it just publishes to the server only the packages which are not already on the server.

## Usage: Docker

- volumes needed (as shown in the `docker-compose.yml`)
  - ./listen:/app/listen -> where to put the packages (ext:tgz,tar) to publish
  - ./backup:/app/backup -> where all packages which were publish successfully
  - ./backup_error:/app/backup_error -> where all packages which did NOT publish successfully
  - ./verdaccio:/app/verdaccio -> must be the actual DB-folder of the verdasccio-registry used.
- command: `docker-compose up`

## Disclaimer

This projects is for personal reasons, so just needed it to work and that's all, so didn't put effort to make the code cleaner and more maintainable.

## How it works

- Overriding the 'publish.js' in the 'npm' package (yes - it's the same npm package you use all the time, so you can also just "npm install npm", and there you have it locally... and import the modules.)
  the local folder "npm_publish" has the patched file of 'publish.js', so in the docker file the patched one is overriding the original.
- Accessing the actual 'storage' folder of the verdaccio DB, opening the package.json of the package to publish.
- If the package doesn't exist - uses the npm.commands.publish from in the 'npm' package (via custom 'publish.js').

## Contributing

- The current usage is using:
  - Checking the 'package.json' file on disk of the verdaccio storage directory.
  - The npm-publish api (REST PUT method)
- I've tried playing around with the internal verdaccio-package 'local-storage' object. I'm sure it's possible to use as the checking/updating/publishing package data, but since I just need it to work, I've just done it the way I did, although it will be faster using the 'local-storage' object.
  my code is initalizing the 'localStorage' object, but then didn't use it. Whom ever wants to contribute - will be great help.

# Enjoy
