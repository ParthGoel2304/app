import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#f5f5f5' },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="files" />
        <Stack.Screen name="sheets" />
        <Stack.Screen name="data" />
      </Stack>
    </>
  );
}