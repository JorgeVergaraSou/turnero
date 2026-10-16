import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MAX_ID, ParseIdPipe } from './parse-id.pipe';
import { ObjectBodyPipe } from './object-body.pipe';

describe('ParseIdPipe', () => {
  const pipe = new ParseIdPipe();

  it.each([
    ['1', 1],
    ['42', 42],
    [' 7 ', 7],
    [String(MAX_ID), MAX_ID],
    [5, 5],
  ])('%j → %d', (input, expected) => {
    expect(pipe.transform(input)).toBe(expected);
  });

  it.each(['abc', '', '1.5', '1e3', '0x10', '1;DROP', ' ', '--1', 'NaN'])(
    '%j no es un número → 400',
    (input) => {
      expect(() => pipe.transform(input)).toThrow(BadRequestException);
    },
  );

  it.each([null, undefined, {}, [], true])(
    '%j (no es texto) → 400',
    (input) => {
      expect(() => pipe.transform(input)).toThrow(BadRequestException);
    },
  );

  it.each([
    '0',
    '-1',
    '-99999999999999999999',
    '99999999999999999999',
    String(MAX_ID + 1),
    '4294967296',
  ])(
    '%j es un número que no puede ser un id → 404 (igual que un id que no existe)',
    (input) => {
      expect(() => pipe.transform(input)).toThrow(NotFoundException);
    },
  );
});

describe('ObjectBodyPipe', () => {
  const pipe = new ObjectBodyPipe();
  class Dto {}

  it('rechaza una lista donde se espera un objeto (DTO)', () => {
    expect(() => pipe.transform([], { type: 'body', metatype: Dto })).toThrow(
      BadRequestException,
    );
    expect(() =>
      pipe.transform([{ a: 1 }], { type: 'body', metatype: Dto }),
    ).toThrow(BadRequestException);
  });

  it('deja pasar objetos, y listas cuando el endpoint declara que espera una lista', () => {
    expect(pipe.transform({ a: 1 }, { type: 'body', metatype: Dto })).toEqual({
      a: 1,
    });
    expect(pipe.transform([1, 2], { type: 'body', metatype: Array })).toEqual([
      1, 2,
    ]);
  });

  it('no toca parámetros que no son el cuerpo', () => {
    expect(pipe.transform([], { type: 'query', metatype: Dto })).toEqual([]);
    expect(pipe.transform([], { type: 'param', metatype: Dto })).toEqual([]);
  });

  it('sin tipo declarado no decide nada', () => {
    expect(pipe.transform([], { type: 'body' })).toEqual([]);
  });
});
