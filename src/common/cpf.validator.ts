import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * Valida um CPF brasileiro pelos dígitos verificadores (algoritmo oficial).
 * Aceita com ou sem máscara (`123.456.789-09` ou `12345678909`).
 */
export function isValidCpf(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const cpf = value.replace(/\D/g, '');
  if (cpf.length !== 11) return false;
  // Rejeita sequências repetidas (000..., 111..., etc.) — passam na conta mas são inválidas.
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digits = cpf.split('').map(Number);
  const check = (len: number): number => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += digits[i] * (len + 1 - i);
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  return check(9) === digits[9] && check(10) === digits[10];
}

/** Decorator class-validator: `@IsCPF()`. */
export function IsCPF(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCPF',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown) => isValidCpf(value),
        defaultMessage: (args: ValidationArguments) =>
          `${args.property} deve ser um CPF válido`,
      },
    });
  };
}
