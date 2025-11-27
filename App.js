// App.js
import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import AdminBooking from "./src/screens/AdminBookingScreen";
import AdminLoginScreen from "./src/screens/AdminLoginScreen";
import Home from "./src/screens/Home";
import Contact from "./src/screens/Contact";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Bottom Tab Screens (Public area)
function PublicTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home" component={Home} />
      <Tab.Screen name="Contact" component={Contact} />

      {/* You can keep Login inside tabs OR remove it */}
      <Tab.Screen name="AdminLogin" component={AdminLoginScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>

        {/* Public Tabs */}
        <Stack.Screen name="Tabs" component={PublicTabs} />

        {/* Admin Screens */}
        <Stack.Screen name="AdminBooking" component={AdminBooking} />

      </Stack.Navigator>
    </NavigationContainer>
  );
}
