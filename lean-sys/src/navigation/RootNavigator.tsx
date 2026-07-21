import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { COLOR, FONT, MONO } from '../theme';
import { useApp } from '../context/AppContext';
import { HomeScreen } from '../screens/HomeScreen';
import { FuelScreen } from '../screens/FuelScreen';
import { TrainScreen } from '../screens/TrainScreen';
import { BodyScreen } from '../screens/BodyScreen';
import { SysScreen } from '../screens/SysScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';

const Tab = createBottomTabNavigator();

const navTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: COLOR.accent,
    background: COLOR.bg,
    card: COLOR.bg,
    text: COLOR.text,
    border: COLOR.line,
    notification: COLOR.accent,
  },
};

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text style={[styles.tabLabel, { color: focused ? COLOR.accent : COLOR.textFaint }]}>
      {label}
    </Text>
  );
}

/** Minimal glyphs as text — keeps the brutalist look, no icon fonts. */
function TabGlyph({ glyph, focused }: { glyph: string; focused: boolean }) {
  return (
    <View style={styles.glyphWrap}>
      <Text style={[styles.glyph, { color: focused ? COLOR.accent : COLOR.textFaint }]}>{glyph}</Text>
    </View>
  );
}

export function RootNavigator() {
  const { ready, profiles } = useApp();

  if (!ready) {
    return (
      <View style={styles.boot}>
        <Text style={styles.bootText}>LEAN.SYS</Text>
        <Text style={styles.bootSub}>BOOTING…</Text>
      </View>
    );
  }

  // First launch: onboard operator 1 (name, sex, equipment). The partner is
  // added later from SYS, so we only gate on whether anyone is set up yet.
  if (!profiles.some((p) => p.onboarded)) {
    return <OnboardingScreen />;
  }

  return (
    <NavigationContainer theme={navTheme}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarShowLabel: true,
        }}
      >
        <Tab.Screen
          name="HOME"
          component={HomeScreen}
          options={{
            tabBarLabel: ({ focused }) => <TabLabel label="HOME" focused={focused} />,
            tabBarIcon: ({ focused }) => <TabGlyph glyph="▚" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="FUEL"
          component={FuelScreen}
          options={{
            tabBarLabel: ({ focused }) => <TabLabel label="FUEL" focused={focused} />,
            tabBarIcon: ({ focused }) => <TabGlyph glyph="◇" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="TRAIN"
          component={TrainScreen}
          options={{
            tabBarLabel: ({ focused }) => <TabLabel label="TRAIN" focused={focused} />,
            tabBarIcon: ({ focused }) => <TabGlyph glyph="≡" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="BODY"
          component={BodyScreen}
          options={{
            tabBarLabel: ({ focused }) => <TabLabel label="BODY" focused={focused} />,
            tabBarIcon: ({ focused }) => <TabGlyph glyph="◱" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="SYS"
          component={SysScreen}
          options={{
            tabBarLabel: ({ focused }) => <TabLabel label="SYS" focused={focused} />,
            tabBarIcon: ({ focused }) => <TabGlyph glyph="※" focused={focused} />,
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: COLOR.bg,
    borderTopWidth: 1,
    borderTopColor: COLOR.line,
    height: 62,
    paddingTop: 6,
    paddingBottom: 8,
  },
  tabLabel: { fontFamily: MONO, fontSize: 9, letterSpacing: 1.5 },
  glyphWrap: { alignItems: 'center', justifyContent: 'center' },
  glyph: { fontFamily: MONO, fontSize: 16 },
  boot: { flex: 1, backgroundColor: COLOR.bg, alignItems: 'center', justifyContent: 'center' },
  bootText: { color: COLOR.accent, fontFamily: MONO, fontSize: FONT.xl, letterSpacing: 4, fontWeight: '700' },
  bootSub: { color: COLOR.textFaint, fontFamily: MONO, fontSize: FONT.sm, letterSpacing: 2, marginTop: 8 },
});
