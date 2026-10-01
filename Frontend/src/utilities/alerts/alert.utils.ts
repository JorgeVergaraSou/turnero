// src/utilities/alerts/alert.utils.ts

import Swal from "sweetalert2";

export const showSuccess = (
  title: string,
  text?: string,
) => {

  return Swal.fire({
    icon: "success",
    title,
    text,
  });

};

export const showError = (
  text: string,
  title = "Error",
) => {

  return Swal.fire({
    icon: "error",
    title,
    text,
  });

};
