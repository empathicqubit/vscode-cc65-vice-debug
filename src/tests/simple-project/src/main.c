#include <stdio.h>
#include <cbm.h>
#include <stdlib.h>
#include <unistd.h>

#define TEST_FLAG (unsigned char *)0x03fc

void steps(void);

void pause_test(void);

unsigned char main(void) {
    *TEST_FLAG = 0x00;
    puts("Hello world!");
    steps();
    if(*TEST_FLAG == 0x01) {
        pause_test();
    }
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

void pause_test(void) {
    while(1) {
        sleep(1);
        sleep(1);
        sleep(1);
        sleep(1);
        sleep(1);
        sleep(1);
        sleep(1);
        sleep(1);
        sleep(1);
        sleep(1);
        sleep(1);
        sleep(1);
        sleep(1);
        sleep(1);
        sleep(1);
        sleep(1);
        sleep(1);
        sleep(1);
        sleep(1);
        sleep(1);
        sleep(1);
        sleep(1);
        sleep(1);
        sleep(1);
    }
}