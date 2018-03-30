/* eslint-disable max-len*/

'use strict';
module.exports = function(grunt) {
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    meta: {},
    jshint: {
      options: {
        reporter: require('jshint-stylish')
      },
      // when this task is run, lint the Gruntfile and all js files in src
      build: [
        'Gruntfile.js',
        'src/webapp/components/**/*.js'
      ]
    },
    uglify: {
      options: {
        banner: '/*\n <%= pkg.name %> <%= grunt.template.today("yyyy-mm-dd") %> \n*/\n',
        beautify: true,
        mangle: true
      },
      build: {
        files: {
          'src/webapp/dist/js/provider.js': 'src/webapp/dist/js/provider.js'
        }
      }
    },
    ngAnnotate: {
      options: {},
      build: {
        files: {
          'src/webapp/dist/js/provider.js': 'src/webapp/dist/js/provider.js'
        }
      }
    },
    concat: {
      options: {
        separator: ';'
      },
      build: {
        files: {
          'src/webapp/dist/js/provider.js': [
            'src/webapp/components/userProfile/userProfile.module.js',
            'src/webapp/components/**/*.js'
          ]
        }
      }
    },
    run: {
      server: {
        args: ['node src/server.js --harmony']
      }
    },
    less: {
      options: {
        compress: true,
        yuicompress: true,
        optimization: 2
      },
      layout: {
        src: [
          'src/webapp/resources/less/layout.less',
          'src/webapp/resources/less/userProfile.less'
        ],
        dest: 'src/webapp/dist/css/layout.css'
      },
      theme: {
        src: [
          'src/webapp/resources/less/defaultTheme.less'
        ],
        dest: 'src/webapp/dist/css/defaultTheme.css'
      }
    },
    watch: {
      set1: {
        files: 'src/webapp/components/**/*.js',
        tasks: ['concat']
      },
      set2: {
        files: 'src/webapp/resources/less/*.less',
        tasks: ['cssCompile']
      }
    }
  });
  grunt.registerTask('cssCompile', ['less:layout','less:theme']);
  grunt.registerTask('prod', [
    'npm-install',
    /* 'jshint', */
    'concat',
    'ngAnnotate',
    'uglify'
  ]);
  grunt.registerTask('dev', [
    'npm-install',
    /* 'jshint',*/
    'concat',
    'ngAnnotate'
  ]);
  grunt.registerTask('serve', [
    /* 'jshint',*/
    'concat',
    'ngAnnotate',
    'uglify',
    'cssCompile'
  ]);
  grunt.registerTask('watchboth', [
    'watch:set1',
    'watch:set2'
  ]);
  grunt.loadNpmTasks('grunt-npm-install');
  grunt.loadNpmTasks('grunt-run');
  grunt.loadNpmTasks('grunt-ng-annotate');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-less');
  grunt.loadNpmTasks('grunt-contrib-cssmin');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-contrib-less');
  grunt.loadNpmTasks('grunt-contrib-watch');
};
