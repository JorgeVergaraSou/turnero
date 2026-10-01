import { Link, Route, Routes } from "react-router-dom"
import { NotFoundProps } from "@/interfaces"
import { PublicRoutes } from "@/models"

function RoutesWithNotFound({ children }: NotFoundProps) {
    return (
        <Routes>

            {children}
            <Route path="*" element={
                <div className="grid min-h-dvh place-items-center px-4">
                    <div className="max-w-sm text-center">
                        <h1 className="text-2xl font-bold">Esta página no existe</h1>
                        <p className="mt-2 text-ink-soft">Revisá la dirección o volvé al inicio.</p>
                        <div className="mt-6 flex justify-center gap-4">
                            <Link to="/" className="text-eucalyptus underline underline-offset-2">Pedir turno</Link>
                            <Link to={`/${PublicRoutes.LOGIN}`} className="text-eucalyptus underline underline-offset-2">Acceso del personal</Link>
                        </div>
                    </div>
                </div>
                } />

        </Routes>
    )

}
export default RoutesWithNotFound
