//src/redux/states/user.ts
import { createSlice } from "@reduxjs/toolkit";
import { jwtDecode } from "jwt-decode";
import { Roles, UserInfo } from "@/models";
import { clearLocalStorage, persistLocalStorage } from "@/utilities";
import { DecodedToken } from "@/interfaces/decode.token.interface";

export const EmptyUserState: UserInfo = {
    idUser: 0,
    name: '',
    nickUsuario: '',
    role: Roles.EMPTY,
    token: ''
}

export const UserKey = 'user';

/**
 * Lee el usuario guardado en localStorage y valida que el token no esté
 * vencido antes de restaurar la sesión. Si el token expiró (por ejemplo
 * quedó una sesión vieja de cuando el backend estuvo caído), se descarta
 * y arranca como sesión vacía en vez de quedar "logueado" sin poder hacer
 * ninguna petición real (evita el flash del menú privado sobre el login).
 */
const getInitialUserState = (): UserInfo => {
    const userStorage = localStorage.getItem(UserKey);

    if (!userStorage) {
        return EmptyUserState;
    }

    try {
        const user = JSON.parse(userStorage) as UserInfo;

        if (!user.token) {
            throw new Error('Sesión sin token');
        }

        const { exp } = jwtDecode<DecodedToken>(user.token);

        if (exp * 1000 <= Date.now()) {
            throw new Error('Token expirado');
        }

        return user;
    } catch {
        clearLocalStorage(UserKey);
        return EmptyUserState;
    }
};

export const userSlice = createSlice({
    name: 'user',
    initialState: getInitialUserState(),
    reducers: {
        createUser: (_state, action) =>  {
            persistLocalStorage(UserKey, action.payload);
            return action.payload;
        },
        updateUser: (state, action) => {
            const result = { ...state, ...action.payload };
            persistLocalStorage(UserKey, result);
            return result;
        },
        resetUser: () => {
            clearLocalStorage(UserKey);
            return EmptyUserState;
        }
    }
});

export const { createUser, updateUser, resetUser } = userSlice.actions;

export default userSlice.reducer;
