import { Navigate } from "react-router-dom"
import { useSelector } from "react-redux"
import { Roles } from "@/models"
import { AppStore } from "@/redux/store"
import { getRoleRoute } from "@/utilities"

/**
 * /private/* solo redirige al inicio del rol del usuario. Antes montaba
 * acá adentro las páginas de cada rol SIN RoleGuard (cualquier usuario
 * logueado podía abrir /private/admin); las rutas por rol viven únicamente
 * en App.tsx, cada una detrás de su RoleGuard.
 */
function Private() {
  const user = useSelector((state: AppStore) => state.user)
  return <Navigate replace to={getRoleRoute(user.role as Roles)} />
}
export default Private
