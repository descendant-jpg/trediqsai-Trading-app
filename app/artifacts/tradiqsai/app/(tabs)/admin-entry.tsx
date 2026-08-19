import { Redirect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';

export default function AdminEntry() {
  const { isGodAdmin, roleLoading } = useAuth();
  if (roleLoading) return null;
  return <Redirect href={isGodAdmin ? '/admin' : '/(tabs)'} />;
}