import mv from 'mv';

interface Options {
  mkdirp?: boolean;
  clobber?: boolean;
}

export const mvSync = (src: string, dest: string, options: Options): Promise<void | Error> => {
  return new Promise((resolve, reject) =>
    mv(src, dest, options, err => {
      return err ? reject(err) : resolve();
    }),
  );
};
