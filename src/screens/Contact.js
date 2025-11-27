import React from 'react';
import { View, Text, Button } from 'react-native';

export default function Contact({ navigation }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontSize: 24, marginBottom: 12 }}>Contact Page</Text>
      <Button title="Go to Profile" onPress={() => navigation.navigate('Home')} />
    </View>
  );
}