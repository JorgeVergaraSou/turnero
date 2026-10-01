import Roles from "./roles.enum";

export interface UserInfo {
   idUser: number;
    name: string;
    nickUsuario: string;
    role: Roles;
    token?: string;
}
