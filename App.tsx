import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import EnrollScreen from "./screens/EnrollScreen";
import DevicesScreen from "./screens/DevicesScreen";
import OverridesScreen from "./screens/OverridesScreen";
import SecurityFeedScreen from "./screens/SecurityFeedScreen";

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: {
            backgroundColor: "#0D1220",
            borderTopColor: "#1C2540",
            borderTopWidth: 1,
            height: 64,
            paddingBottom: 8,
          },
          tabBarActiveTintColor: "#00E5C0",
          tabBarInactiveTintColor: "#3A4060",
          tabBarLabelStyle: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
          tabBarIcon: ({ color, size }) => {
            const icons: Record<string, string> = {
              Cadastro: "👤",
              Dispositivos: "📡",
              Overrides: "🔑",
              Segurança: "🛡️",
            };
            return <Text style={{ fontSize: 18 }}>{icons[route.name]}</Text>;
          },
        })}
      >
        <Tab.Screen name="Cadastro" component={EnrollScreen} />
        <Tab.Screen name="Dispositivos" component={DevicesScreen} />
        <Tab.Screen name="Overrides" component={OverridesScreen} />
        <Tab.Screen name="Segurança" component={SecurityFeedScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}