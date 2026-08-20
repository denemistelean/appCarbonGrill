/** Cola FIFO: una consulta SUNAT a la vez. */
export function createMutexQueue() {
  let chain = Promise.resolve();

  return function enqueue(fn) {
    const run = chain.then(() => fn());
    chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };
}
