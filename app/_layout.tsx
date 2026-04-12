import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0d3b22' },
          headerTintColor: '#a9dfbf',
          headerTitleStyle: { fontWeight: 'bold', color: '#fff' },
          contentStyle: { backgroundColor: '#145a32' },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen
          name="index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="new-game"
          options={{ title: 'Nueva Partida', headerBackTitle: 'Inicio' }}
        />
        <Stack.Screen
          name="game"
          options={{
            title: 'Canastón',
            headerBackVisible: false, // prevent accidental back during game
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="round-summary"
          options={{
            title: 'Fin de Ronda',
            headerBackVisible: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="final-result"
          options={{
            title: 'Fin de Partida',
            headerBackVisible: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="rules"
          options={{ title: 'Reglas', headerBackTitle: 'Volver' }}
        />
      </Stack>
    </>
  );
}
