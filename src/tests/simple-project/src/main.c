#include <stdio.h>
#include <cbm.h>
#include <stdlib.h>

void steps(void);

unsigned char main(void) {
    puts("Hello world!");
    steps();
    return 0;
}

void steps(void) {
    unsigned char i = 0xf0;
    unsigned char j = 0xff;
    puts("f is for friends who do stuff together");
    puts("u is for u and me");
    puts("n is for nywhere");
    puts("and nytime at alll");
    puts("down here in the deep blue sea!");
    i--;
    printf("%d", j - i);
}

void open_a_thing(void) {
    static unsigned char barg = 0;
    unsigned char i = 0;
    barg++;
    i++;
    printf("%d %d", barg, i);
    cbm_k_open();
    for(i = 0; i < 100; i++) {
        if(i % 3 == 0) {
            printf("Fizz");
        }
        if(i % 5 == 0) {
            printf("Buzz");
        }

        if(
            i % 5 != 0 
            && i % 3 != 0
            ) {
            printf("%d", i);
        }

        puts("");
    }
}