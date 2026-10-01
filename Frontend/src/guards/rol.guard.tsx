//src/guards/rol.guard.tsx
import { useSelector } from 'react-redux';
import { Navigate, Outlet } from 'react-router-dom';
import { PrivateRoutes } from '@/models';
import { AppStore } from '@/redux/store';
import { RoleProps } from '@/interfaces';

function RoleGuard({ roles }: RoleProps) {
  const userState = useSelector((store: AppStore) => store.user);
  return roles.includes(userState.role) ? <Outlet /> : <Navigate replace to={PrivateRoutes.PRIVATE} />;
}

export default RoleGuard;
