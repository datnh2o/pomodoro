<template>
  <v-card
    v-if="!isEditing"
    class="d-flex align-center pa-2"
    style="gap: 8px"
    flat
    rounded="lg"
  >
    <v-checkbox
      @click="updateRecord(item)"
      v-model="item.done"
      hide-details
      class="mt-0 pt-0"
    ></v-checkbox>
    <v-card
      flat
      :disabled="item.done"
      class="d-flex flex-column"
      style="gap: 8px; width: 100%"
    >
      <div class="d-flex align-center">
        <b
          style="max-width: 70%"
          class="ml-2 text-h6"
          :class="item.done ? 'text-decoration-line-through' : ''"
          >{{ item.title }}</b
        >
        <v-spacer />
        <v-chip text-color="white" color="primary">
          {{ item.pomos }} pomos
          <v-icon small right> mdi-timer-sand </v-icon>
        </v-chip>
        &nbsp;
        <v-menu bottom left>
          <template v-slot:activator="{ on, attrs }">
            <v-btn icon v-bind="attrs" v-on="on">
              <v-icon>mdi-dots-vertical</v-icon>
            </v-btn>
          </template>
          <v-list>
            <v-list-item @click="isEditing = true">
              <v-list-item-icon>
                <v-icon>mdi-pencil</v-icon>
              </v-list-item-icon>
              <v-list-item-content>
                <v-list-item-title>Edit</v-list-item-title>
              </v-list-item-content>
            </v-list-item>
            <v-list-item @click="$emit('delete', item)">
              <v-list-item-icon>
                <v-icon>mdi-delete</v-icon>
              </v-list-item-icon>
              <v-list-item-content>
                <v-list-item-title>Delete</v-list-item-title>
              </v-list-item-content>
            </v-list-item>
          </v-list>
        </v-menu>
      </div>
      <div v-if="item.note" class="d-flex align-center">
        <v-icon>mdi-note-text-outline</v-icon>
        <div class="ml-2">{{ item.note }}</div>
      </div>
    </v-card>
  </v-card>
  <task-input
    v-else
    :task="item"
    @update="updateRecord"
    @cancel="isEditing ? (isEditing = false) : null"
  ></task-input>
</template>
<script>
export default {
  props: {
    item: {
      type: Object,
      required: true,
    },
  },
  data() {
    return {
      isEditing: false,
    };
  },
  methods: {
    updateRecord(task) {
      this.$emit("update", task);
      this.isEditing = false;
    },
  },
};
</script>
