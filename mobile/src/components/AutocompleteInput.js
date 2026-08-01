// Resolution Fitness App — AutocompleteInput
// A reusable text input that fetches suggestions as the user types.
// Uses a debounce and renders a dropdown of selectable results.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { useTheme, useThemedStyles } from '../contexts/ThemeContext';
import Typography from '../theme/typography';
import { Spacing, BorderRadius } from '../theme/spacing';

const DEBOUNCE_MS = 300;
// Suggestions are short; only enable inner scrolling once the list is tall
// enough to benefit (matches the dropdown's ~200dp max height).
const SUGGESTIONS_SCROLL_THRESHOLD = 4;

export default function AutocompleteInput({
  value,
  onChangeText,
  onSelectSuggestion,
  placeholder,
  searchFn,
  renderSuggestion,
  label,
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  const fetchSuggestions = useCallback(async (text) => {
    if (!text || text.length < 3 || !searchFn) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    try {
      const data = await searchFn(text);
      const list = data?.data || [];
      setSuggestions(list);
    } catch (err) {
      console.warn('Autocomplete search failed:', err.message);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [searchFn]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchSuggestions(query);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query, fetchSuggestions]);

  const handleChange = (text) => {
    setQuery(text);
    onChangeText?.(text);
    setShowSuggestions(true);
  };

  const handleSelect = (item) => {
    onSelectSuggestion?.(item);
    setQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const renderItem = ({ item, index }) => {
    if (renderSuggestion) {
      return renderSuggestion(item, index, handleSelect, styles, colors);
    }
    return (
      <TouchableOpacity
        style={[styles.suggestionItem, { borderBottomColor: colors.divider }]}
        onPress={() => handleSelect(item)}
      >
        <Text style={[styles.suggestionText, { color: colors.textPrimary }]} numberOfLines={1}>
          {item.name}
        </Text>
        {item.address ? (
          <Text style={[styles.suggestionAddress, { color: colors.textMuted }]} numberOfLines={1}>
            {item.address}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {label ? (
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      ) : null}
      <View style={styles.inputRow}>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: colors.surfaceMuted, color: colors.textPrimary, borderColor: colors.border },
          ]}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={handleChange}
          onFocus={() => setShowSuggestions(true)}
        />
        {loading && (
          <ActivityIndicator style={styles.spinner} color={colors.accent} size="small" />
        )}
      </View>
      {showSuggestions && suggestions.length > 0 && (
        <ScrollView
          style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          scrollEnabled={suggestions.length > SUGGESTIONS_SCROLL_THRESHOLD}
        >
          {suggestions.map((item, idx) => (
            <React.Fragment key={`${item.name}-${item.address}-${idx}`}>
              {renderItem({ item, index: idx })}
            </React.Fragment>
          ))}
        </ScrollView>
      )}
      {showSuggestions && suggestions.length === 0 && !loading && query.length >= 3 && (
        <View style={[styles.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            No gyms found. Try entering it manually.
          </Text>
        </View>
      )}
    </View>
  );
}

function makeStyles(theme) {
  const { colors } = theme;
  return StyleSheet.create({
    container: {
      marginBottom: Spacing.md,
    },
    label: {
      ...Typography.caption,
      marginBottom: Spacing.xs,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    input: {
      flex: 1,
      borderWidth: 1,
      borderRadius: BorderRadius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      ...Typography.bodySmall,
    },
    spinner: {
      marginLeft: Spacing.sm,
    },
    dropdown: {
      marginTop: Spacing.xs,
      borderWidth: 1,
      borderRadius: BorderRadius.md,
      maxHeight: 200,
      overflow: 'hidden',
    },
    suggestionItem: {
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderBottomWidth: 1,
    },
    suggestionText: {
      ...Typography.bodySmall,
    },
    suggestionAddress: {
      ...Typography.caption,
      marginTop: 2,
    },
    emptyText: {
      ...Typography.caption,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      textAlign: 'center',
    },
  });
}
