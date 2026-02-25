import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

// Redirect to the tabs-based filter screen
export default function FilterRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/(tabs)/filter' as any);
  }, []);
  return <View style={{ flex: 1, backgroundColor: '#f5f5f5' }} />;
}
