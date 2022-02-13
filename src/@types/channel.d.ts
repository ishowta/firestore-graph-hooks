declare module '@nodeguy/channel' {
  const Channel: <T>() => {
    push: (object: T) => void;
    shift: () => Promise<T>;
  };
  export = Channel;
}
