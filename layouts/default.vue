<template>
  <v-app dark>
    <v-app-bar fixed app :color="theme">
      <v-toolbar-title class="white--text font-weight-bold">
        <icons-tomato :size="20"></icons-tomato> {{ title }}
      </v-toolbar-title>
      <v-spacer />
      <v-menu v-if="user" bottom min-width="200px" rounded offset-y>
        <template v-slot:activator="{ on }">
          <v-btn icon v-on="on" v-if="user">
            <v-avatar size="36">
              <v-img :src="user.photoURL" />
            </v-avatar>
          </v-btn>
          <span class="white--text font-weight-bold">{{
            user.displayName
          }}</span>
        </template>
        <v-card>
          <v-list-item-content class="justify-center">
            <div class="mx-auto text-center px-4">
              <p class="mt-1">
                {{ user.email }}
              </p>
              <v-divider class="my-3"></v-divider>
              <v-btn @click="logout" depressed rounded text> Logout </v-btn>
            </div>
          </v-list-item-content>
        </v-card>
      </v-menu>
      <v-btn
        v-else-if="!user && !loading"
        @click="loginWithGoogle"
        style="letter-spacing: normal; text-transform: unset"
        depressed
      >
        <v-icon left>mdi-google</v-icon> Signup with Google
      </v-btn>
    </v-app-bar>
    <v-main :class="theme">
      <v-container style="height: 100%">
        <Nuxt />
      </v-container>
    </v-main>
    <v-navigation-drawer v-model="rightDrawer" :right="right" temporary fixed>
      <v-list>
        <v-list-item @click.native="right = !right">
          <v-list-item-action>
            <v-icon light> mdi-repeat </v-icon>
          </v-list-item-action>
          <v-list-item-title>Switch drawer (click me)</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-navigation-drawer>
    <v-footer :absolute="!fixed" app>
      <span>&copy; {{ new Date().getFullYear() }} by Datnh2o </span>
    </v-footer>
  </v-app>
</template>
<script>
import {
  auth,
  provider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from "~/plugins/firebase.client";
export default {
  name: "DefaultLayout",
  data() {
    return {
      drawer: false,
      fixed: false,
      items: [
        {
          icon: "mdi-apps",
          title: "Welcome",
          to: "/",
        },
      ],
      miniVariant: false,
      right: true,
      rightDrawer: false,
      title: "Pomodoro Timer",
      user: null,
      loading: true,
      theme: "pomodoro",
    };
  },
  provide() {
    return {
      theme: this.theme,
      setTheme: this.setTheme,
    };
  },
  mounted() {
    onAuthStateChanged(auth, (user) => {
      this.user = user ? user : null;
      this.loading = false;
    });
  },
  methods: {
    async loginWithGoogle() {
      try {
        const result = await signInWithPopup(auth, provider);
        this.user = result.user;
      } catch (error) {
        console.log(error);
      }
    },
    async logout() {
      try {
        await signOut(auth);
        this.user = null;
      } catch (error) {
        console.log(error);
      }
    },
    setTheme(newTheme) {
      this.theme = newTheme;
    },
  },
};
</script>
