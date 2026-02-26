import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="files" />
        <Stack.Screen name="sheets" />
        <Stack.Screen name="data" />
        <Stack.Screen name="filter" />
        <Stack.Screen name="sheetview" />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}