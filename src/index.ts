import loglevel from 'loglevel';
import { apply, reg } from 'loglevel-plugin-prefix';

loglevel.setLevel('info');
reg(loglevel);
apply(loglevel, {
  format(level, name, timestamp) {
    return `[${timestamp}] ${level} ${name}:`;
  },
});

export const logger = loglevel;

export * from './useQuery';
