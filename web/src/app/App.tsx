import { AppRouter } from '@/app/router';
import { GlobalFloatingActions } from '@/components/layout/template-primitives';

export default function App() {
  return (
    <>
      <AppRouter />
      <GlobalFloatingActions />
    </>
  );
}
