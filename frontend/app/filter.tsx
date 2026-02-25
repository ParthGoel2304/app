import { Redirect } from 'expo-router';

// Redirect legacy /filter route to the tabs-based filter screen
export default function FilterRedirect() {
  return <Redirect href={'/(tabs)/filter' as any} />;
}
