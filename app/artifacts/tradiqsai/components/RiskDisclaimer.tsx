import { StyleSheet, Text, View } from 'react-native';

export function RiskDisclaimer() {
  return <View style={styles.card} accessibilityRole="text">
    <Text style={styles.title}>⚠ RISK DISCLAIMER</Text>
    <Text style={styles.copy}>TradiQs AI is strictly an educational and market analytics tool, not a registered brokerage or financial institution. Trading involves substantial risk of loss and is not suitable for every investor. Past performance does not guarantee future results. The content provided is for educational and informational purposes only and does not constitute financial, legal, or investment advice. Always conduct your own due diligence and consult a licensed professional before making any financial decisions.</Text>
  </View>;
}
const styles = StyleSheet.create({
  card: { marginTop: 20, marginHorizontal: 16, padding: 14, borderRadius: 12, backgroundColor: '#16181D', borderWidth: 1, borderColor: '#343027' },
  title: { color: '#F5C542', fontSize: 12, fontFamily: 'Inter_700Bold', marginBottom: 7 },
  copy: { color: '#A7AAB0', fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
});