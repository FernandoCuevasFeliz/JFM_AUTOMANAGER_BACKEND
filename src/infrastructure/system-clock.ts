import { type Clock, toDateOnly } from '../domain/shared/clock';

/** Reloj real del sistema. En los tests se sustituye por uno fijo. */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  today(): string {
    return toDateOnly(this.now());
  }
}
