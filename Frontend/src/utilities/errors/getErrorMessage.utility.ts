// src/utilities/errors/getErrorMessage.utility.ts

export const getErrorMessage = (
  error: unknown,
): string => {

  if (error instanceof Error) {
    return error.message;
  }

  return "Ocurrió un error inesperado";
};
