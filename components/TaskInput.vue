<template>
  <v-card flat width="100%" class="pa-4">
    <br />
    <v-form ref="form" lazy-validation>
      <v-text-field
        v-model="task.title"
        solo
        placeholder="What are you working on?"
        :rules="required"
        maxLength="255"
      ></v-text-field>
      <v-text-field
        v-model="task.pomos"
        type="number"
        label="Est Pomodoros"
        min="1"
        max="10"
        class="col-3 pa-0"
      ></v-text-field>
      <v-textarea
        v-model="task.note"
        rows="2"
        filled
        placeholder="Some notes..."
        maxLength="255"
      ></v-textarea>
    </v-form>
    <v-card-actions>
      <v-btn class="ml-auto btn" text @click="cancel()">Cancel</v-btn>
      <v-btn class="btn" depressed color="accent" @click="submit()">Save</v-btn>
    </v-card-actions>
  </v-card>
</template>
<script>
export default {
  props: {
    task: {
      type: Object,
      required: true,
    },
    isCreating: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      required: [(v) => !!v || "Field is required"],
    };
  },
  computed: {},
  methods: {
    submit() {
      let valid = this.$refs.form.validate();
      if (valid) {
        if (this.isCreating) {
          this.$emit("create", { ...{ done: false }, ...this.task });
        } else {
          this.$emit("update", this.task);
        }
      }
    },
    cancel() {
      this.$emit("cancel");
      this.isCreating ? this.$refs.form.reset() : null;
    },
  },
};
</script>
<style scoped>
.btn {
  text-transform: none;
  letter-spacing: normal;
}
</style>
