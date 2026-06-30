import React from 'react';
import { View } from 'react-native';
import { AmountDisplay } from './AmountDisplay';

export default {
  title: 'AmountDisplay',
  component: AmountDisplay,
  decorators: [
    (Story: any) => (
      <View style={{ padding: 16, justifyContent: 'center', flex: 1 }}>
        <Story />
      </View>
    ),
  ],
};

export const Default = () => <AmountDisplay amount={15000} />;

export const LargeGreen = () => <AmountDisplay amount={75000} color="#2ead4b" size={24} />;

export const NegativeRed = () => <AmountDisplay amount={-3500} color="#d03238" size={14} />;
